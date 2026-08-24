"""Operator authentication: JWT issuance + role extraction.

POST /auth/token: issue a short-lived JWT (24h) from username+password.
GET  /auth/me: return current operator details from token.
GET  /auth/operators: list all operators (no password fields).

SINAGERD roles:
  coen. COEN: sees all 43 Lima districts.
  coer. COER Lima: sees all 43 Lima districts.
  coel. COEL: sees only their district_ubigeo.

Testing: pass X-Testing-Operator header (only active when TESTING=1 env).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt_lib
import redis.asyncio as aioredis

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.config import settings
from costa_api.db import get_db, engine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)


def _hash_password(pw: str) -> str:
    return _bcrypt_lib.hashpw(pw.encode(), _bcrypt_lib.gensalt()).decode()


def _verify_password(pw: str, hashed: str) -> bool:
    return _bcrypt_lib.checkpw(pw.encode(), hashed.encode())

_SECRET = settings.jwt_secret
_ALGO = "HS256"
_TTL_HOURS = 24
# Pre-computed bcrypt hash used as a dummy when user not found, ensures
# _verify_password always runs so response time does not leak username existence.
_DUMMY_BCRYPT_HASH: str = _bcrypt_lib.hashpw(b"__dummy__", _bcrypt_lib.gensalt(12)).decode()

TESTING = os.environ.get("TESTING", "0") == "1"

# ─── Auth rate limiter ────────────────────────────────────────────────────────
# 10 login attempts per IP per 60-second window.
# Uses Redis sliding-window counter; fails open on Redis unavailability so a
# Redis outage never blocks legitimate operators from logging in.

_RATE_LIMIT = 10          # max attempts per window
_RATE_WINDOW = 60         # window in seconds
_rl_client: aioredis.Redis | None = None


def _get_rl_client() -> aioredis.Redis | None:
    global _rl_client
    if _rl_client is None:
        try:
            from costa_api.config import settings as _cfg
            _rl_client = aioredis.from_url(
                _cfg.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
        except Exception as exc:
            logger.warning("[auth] Redis rate-limiter init failed: %s", exc)
    return _rl_client


async def _check_rate_limit(request: Request) -> None:
    """Raise 429 if the IP has exceeded _RATE_LIMIT login attempts in _RATE_WINDOW."""
    if TESTING or os.environ.get("TESTING", "0") == "1":
        return
    client = _get_rl_client()
    if client is None:
        return  # fail open: never block logins due to Redis outage
    ip = (request.headers.get("X-Forwarded-For") or request.client.host or "unknown").split(",")[0].strip()
    key = f"costa:auth:rate:{ip}"
    try:
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, _RATE_WINDOW)
        if count > _RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos de autenticación. Espere 60 segundos.",
                headers={"Retry-After": str(_RATE_WINDOW)},
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("[auth] Rate-limit check failed (fail-open): %s", exc)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    operator_id: int
    username: str
    full_name: str
    role: str
    district_ubigeo: Optional[str]


class OperatorOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    district_ubigeo: Optional[str]
    active: bool
    created_at: datetime


class OperatorCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    full_name: str = Field(..., min_length=1, max_length=200)
    role: str = Field(..., min_length=1, max_length=20)
    district_ubigeo: Optional[str] = Field(None, max_length=12)
    password: str = Field(..., min_length=8, max_length=200)


# ─── Token helpers ────────────────────────────────────────────────────────────

def _issue_token(operator_id: int, username: str, role: str, district_ubigeo: Optional[str]) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=_TTL_HOURS)
    return jwt.encode(
        {"sub": str(operator_id), "username": username, "role": role, "district": district_ubigeo, "exp": exp},
        _SECRET,
        algorithm=_ALGO,
    )


def _decode_token(token: str) -> dict:
    return jwt.decode(token, _SECRET, algorithms=[_ALGO])


# ─── Dependency: current operator ─────────────────────────────────────────────

class CurrentOperator(BaseModel):
    id: int
    username: str
    role: str
    district_ubigeo: Optional[str]


async def get_current_operator(
    request: Request,
    token: Optional[str] = Depends(_oauth2),
) -> Optional[CurrentOperator]:
    """
    Returns None if no valid token (unauthenticated).
    Raises 401 if token present but invalid.
    In TESTING mode, reads X-Testing-Operator header instead.
    """
    if TESTING:
        header = request.headers.get("X-Testing-Operator")
        if header:
            parts = header.split(":", 3)
            try:
                op_id = int(parts[0])
            except (ValueError, IndexError):
                op_id = 0
            return CurrentOperator(
                id=op_id,
                username=parts[1] if len(parts) > 1 else "test",
                role=parts[2] if len(parts) > 2 else "coer",
                district_ubigeo=parts[3] if len(parts) > 3 else None,
            )
    if not token:
        return None
    try:
        data = _decode_token(token)
        return CurrentOperator(
            id=int(data["sub"]),
            username=data["username"],
            role=data["role"],
            district_ubigeo=data.get("district"),
        )
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def require_operator(
    op: Optional[CurrentOperator] = Depends(get_current_operator),
) -> CurrentOperator:
    """Like get_current_operator but requires auth (raises 401 if missing)."""
    if op is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere autenticación.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return op


# ─── Seed demo operators if table is empty ────────────────────────────────────

DEMO_OPERATORS = [
    {
        "username": "coer_lima",
        "full_name": "COER Lima: Operador demo",
        "role": "coer",
        "district_ubigeo": None,
        "password": "demo1234",
    },
    {
        "username": "coen_lima",
        "full_name": "COEN: Coordinador demo",
        "role": "coen",
        "district_ubigeo": None,
        "password": "demo1234",
    },
    {
        "username": "coel_sjl",
        "full_name": "COEL San Juan de Lurigancho: demo",
        "role": "coel",
        "district_ubigeo": "150132",
        "password": "demo1234",
    },
]


async def seed_demo_operators() -> None:
    """Insert demo operators on first run if table is empty."""
    try:
        async with engine.begin() as conn:
            count = (await conn.execute(text("SELECT COUNT(*) FROM ops.operators"))).scalar()
            if count and count > 0:
                return
            for op in DEMO_OPERATORS:
                await conn.execute(
                    text("""
                        INSERT INTO ops.operators (username, full_name, role, district_ubigeo, password_hash)
                        VALUES (:u, :fn, :role, :dist, :ph)
                        ON CONFLICT (username) DO NOTHING
                    """),
                    {
                        "u": op["username"],
                        "fn": op["full_name"],
                        "role": op["role"],
                        "dist": op["district_ubigeo"],
                        "ph": _hash_password(op["password"]),
                    },
                )
            logger.info("[auth] 3 demo operators seeded (password: demo1234)")
    except Exception as exc:
        logger.warning("[auth] Could not seed operators: %s", exc)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/token", response_model=TokenResponse)
async def issue_token(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(_check_rate_limit),
) -> TokenResponse:
    """Issue a JWT for username+password."""
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
    result = await db.execute(
        text("SELECT id, username, password_hash, full_name, role, district_ubigeo, active FROM ops.operators WHERE username = :u"),
        {"u": form.username},
    )
    row = result.mappings().first()
    # Always call _verify_password to avoid timing side-channel that could
    # reveal whether a username exists (bcrypt takes ~100ms; skipping it leaks info).
    pw_hash = row["password_hash"] if row else _DUMMY_BCRYPT_HASH
    pw_ok = _verify_password(form.password, pw_hash)
    if not row or not row["active"] or not pw_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Use DB-canonical username (not raw form input) for token and response
    # so audit trail is always keyed on the normalized record value.
    canonical_username = row["username"]
    token = _issue_token(row["id"], canonical_username, row["role"], row["district_ubigeo"])
    return TokenResponse(
        access_token=token,
        operator_id=row["id"],
        username=canonical_username,
        full_name=row["full_name"],
        role=row["role"],
        district_ubigeo=row["district_ubigeo"],
    )


@router.get("/me", response_model=OperatorOut)
async def current_user(
    op: CurrentOperator = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
) -> OperatorOut:
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
    result = await db.execute(
        text("SELECT id, username, full_name, role, district_ubigeo, active, created_at FROM ops.operators WHERE id = :id"),
        {"id": op.id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Operador no encontrado.")
    return OperatorOut(**dict(row))


@router.get("/operators", response_model=list[OperatorOut])
async def list_operators(
    _op: CurrentOperator = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
) -> list[OperatorOut]:
    """List all operators (COEN/COER only)."""
    if _op.role not in {"coen", "coer"}:
        raise HTTPException(status_code=403, detail="Solo operadores COEN/COER pueden listar operadores.")
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
    result = await db.execute(
        text("SELECT id, username, full_name, role, district_ubigeo, active, created_at FROM ops.operators ORDER BY role, id")
    )
    return [OperatorOut(**dict(r)) for r in result.mappings().all()]


@router.post("/operators", response_model=OperatorOut, status_code=201)
async def create_operator(
    body: OperatorCreate,
    _op: CurrentOperator = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
) -> OperatorOut:
    if _op.role not in {"coen", "coer"}:
        raise HTTPException(status_code=403, detail="Solo operadores COEN/COER pueden crear cuentas de operador.")
    valid_roles = {"coen", "coer", "coel"}
    if body.role not in valid_roles:
        raise HTTPException(status_code=422, detail=f"role must be one of: {', '.join(sorted(valid_roles))}")
    if body.role == "coel" and not body.district_ubigeo:
        raise HTTPException(status_code=422, detail="COEL operators require a district_ubigeo.")
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
    try:
        row = await db.execute(
            text("""
                INSERT INTO ops.operators (username, full_name, role, district_ubigeo, password_hash)
                VALUES (:u, :fn, :role, :dist, :ph)
                RETURNING id, username, full_name, role, district_ubigeo, active, created_at
            """),
            {
                "u": body.username,
                "fn": body.full_name,
                "role": body.role,
                "dist": body.district_ubigeo,
                "ph": _hash_password(body.password),
            },
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un operador con ese nombre de usuario.")
    return OperatorOut(**dict(row.mappings().one()))
