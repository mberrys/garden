import { readFileSync, writeFileSync } from "node:fs";

const files = JSON.parse(readFileSync("/tmp/vercel-files.json", "utf8"));
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
const authToken = process.env.SENTRY_AUTH_TOKEN ?? "";

const envContent = `NEXT_PUBLIC_SENTRY_DSN=${dsn}
SENTRY_DSN=${dsn}
SENTRY_AUTH_TOKEN=${authToken}
RR_FORCE_MOCK_AI=1
`;

const payload = {
  target: "production",
  name: "rr",
  teamId: "team_frbtrtpv4KZZ0ORNQ89B2Bqt",
  projectSettings: {
    framework: "nextjs",
    buildCommand: "npm run build",
    installCommand: "npm install",
  },
  files: [
    ...files.filter((f) => f.file !== ".env.example"),
    { file: ".env", data: envContent },
  ],
};

writeFileSync("/tmp/vercel-deploy-payload.json", JSON.stringify(payload));
console.log("payload bytes", JSON.stringify(payload).length);
