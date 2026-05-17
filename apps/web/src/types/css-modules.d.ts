// Allow importing CSS files from npm packages in TypeScript files
declare module "driver.js/dist/driver.css" {
  const content: string;
  export default content;
}
