const required = ["AUTH_SECRET", "DATABASE_URL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required deployment configuration: ${missing.join(", ")}`);

if ((process.env.AUTH_SECRET ?? "").length < 32) {
  throw new Error("AUTH_SECRET must be at least 32 characters.");
}

if (process.env.DEPLOYMENT_MODE === "public" && process.env.COOKIE_SECURE !== "true") {
  throw new Error("Public deployments require COOKIE_SECURE=true and HTTPS.");
}

console.log("Deployment configuration verified.");
