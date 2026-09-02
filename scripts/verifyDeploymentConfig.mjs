const required = ["DATABASE_URL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required deployment configuration: ${missing.join(", ")}`);

if (process.env.DEPLOYMENT_MODE === "public") {
  throw new Error("Public deployment is disabled while the app is a password-free single-user workspace.");
}

console.log("Deployment configuration verified.");
