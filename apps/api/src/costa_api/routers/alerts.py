"""Alerts feed endpoints — CRUD + acknowledge/escalate actions."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertSummary(BaseModel):
    id: int
    type: str
    severity: str
    status: str
    title: str
    district_id: Optional[int]
    created_at: datetime


class AlertAction(BaseModel):
    operator_id: str
    action: str  # acknowledge | escalate | false_positive | close
    note: Optional[str] = None


@router.get("", response_model=list[AlertSummary])
async def list_alerts(
    status: str | None = Query(None),
    severity: str | None = Query(None),
    district_id: int | None = Query(None),
    limit: int = Query(50, le=200),
):
    """Return active alerts, newest first."""
    # TODO Sprint 6: query ops.alerts
    return []


@router.post("/{alert_id}/action")
async def act_on_alert(alert_id: int, action: AlertAction):
    """Acknowledge, escalate, or close an alert; logs to decision_log."""
    # TODO Sprint 6: update ops.alerts + append to ops.decision_log
    raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
