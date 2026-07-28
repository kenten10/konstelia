import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const maxFileBytes = 5 * 1024 * 1024;
const scanHistory = process.argv.includes("--history");

const forbiddenPaths = [
  {
    name: "environment file",
    pattern: /(^|\/)\.env(?:\.|$)/i,
    allow: /(^|\/)\.env\.example$/i,
  },
  {
    name: "package-manager credentials",
    pattern: /(^|\/)\.(?:npmrc|yarnrc|netrc)$/i,
  },
  {
    name: "private key or certificate",
    pattern: /\.(?:pem|key|p12|pfx|jks|keystore|mobileprovision)$/i,
  },
  {
    name: "SSH private key",
    pattern: /(^|\/)(?:id_rsa|id_ed25519)$/i,
  },
  {
    name: "credential JSON",
    pattern: /(^|\/)(?:credentials|service-account|secrets?)(?:[._-][^/]*)?\.json$/i,
  },
  {
    name: "generated directory",
    pattern: /(^|\/)(?:node_modules|dist|out|coverage|\.test-dist)(?:\/|$)/,
  },
  {
    name: "generated artifact",
    pattern: /\.(?:vsix|tgz|log)$/i,
  },
  {
    name: "operating-system metadata",
    pattern: /(^|\/)(?:\.DS_Store|Thumbs\.db)$/i,
  },
];

const secretPatterns = [
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    gitPattern: "-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
  },
  {
    name: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    gitPattern: "(AKIA|ASIA)[0-9A-Z]{16}",
  },
  {
    name: "GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
    gitPattern: "gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,}",
  },
  {
    name: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    gitPattern: "AIza[0-9A-Za-z_-]{35}",
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    gitPattern: "xox[baprs]-[A-Za-z0-9-]{10,}",
  },
  {
    name: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    gitPattern: "sk-(proj-)?[A-Za-z0-9_-]{20,}",
  },
  {
    name: "Stripe live key",
    pattern: /\b[rs]k_live_[A-Za-z0-9]{16,}\b/,
    gitPattern: "[rs]k_live_[A-Za-z0-9]{16,}",
  },
  {
    name: "npm access token",
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/,
    gitPattern: "npm_[A-Za-z0-9]{36}",
  },
  {
    name: "SendGrid API key",
    pattern: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
    gitPattern: "SG\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}",
  },
];

const findings = new Map();

function record(source, path, rule) {
  const key = `${source}:${path}:${rule}`;
  findings.set(key, { source, path, rule });
}

function checkPath(source, path) {
  for (const rule of forbiddenPaths) {
    if (rule.pattern.test(path) && !rule.allow?.test(path)) {
      record(source, path, rule.name);
    }
  }
}

function checkContent(source, path, content) {
  if (content.length > maxFileBytes) {
    record(source, path, `file exceeds ${maxFileBytes / 1024 / 1024} MiB`);
    return;
  }
  if (content.includes(0)) {
    return;
  }
  const text = content.toString("utf8");
  for (const rule of secretPatterns) {
    if (rule.pattern.test(text)) {
      record(source, path, rule.name);
    }
  }
}

function gitText(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const candidateFiles = gitText([
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
]).split("\0").filter((path) => path && existsSync(path));
for (const path of candidateFiles) {
  checkPath("working-tree", path);
  checkContent("working-tree", path, readFileSync(path));
}

if (scanHistory) {
  const revisions = gitText(["rev-list", "--all"]).split("\n").filter(Boolean);
  const historicalPaths = gitText(["log", "--all", "--name-only", "--format="])
    .split("\n")
    .filter(Boolean);
  for (const path of historicalPaths) {
    checkPath("history", path);
  }

  const objects = gitText(["rev-list", "--objects", "--all"]).split("\n").filter(Boolean);
  const objectPaths = new Map();
  for (const entry of objects) {
    const separator = entry.indexOf(" ");
    if (separator < 0) {
      continue;
    }
    const objectId = entry.slice(0, separator);
    const path = entry.slice(separator + 1);
    if (!objectPaths.has(objectId)) {
      objectPaths.set(objectId, path);
    }
  }
  const objectIds = [...objectPaths.keys()];
  const objectMetadata = execFileSync(
    "git",
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    {
      input: objectIds.join("\n"),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  for (const line of objectMetadata.split("\n").filter(Boolean)) {
    const [objectId, type, rawSize] = line.split(" ");
    const path = objectPaths.get(objectId);
    if (path && type === "blob" && Number(rawSize) > maxFileBytes) {
      record("history", path, `file exceeds ${maxFileBytes / 1024 / 1024} MiB`);
    }
  }

  for (const rule of secretPatterns) {
    let matches = "";
    try {
      matches = gitText([
        "grep",
        "-I",
        "-l",
        "-E",
        "-e",
        rule.gitPattern,
        ...revisions,
        "--",
      ]);
    } catch (error) {
      if (error?.status !== 1) {
        throw error;
      }
    }
    for (const match of matches.split("\n").filter(Boolean)) {
      const separator = match.indexOf(":");
      const path = separator < 0 ? match : match.slice(separator + 1);
      record("history", path, rule.name);
    }
  }
}

if (findings.size > 0) {
  console.error("Public repository safety check failed:");
  for (const finding of findings.values()) {
    console.error(`- [${finding.source}] ${finding.path}: ${finding.rule}`);
  }
  console.error("Remove the file or secret before committing or pushing.");
  process.exit(1);
}

console.log(
  `Public repository safety check passed (${candidateFiles.length} publishable files` +
    `${scanHistory ? ", including Git history" : ""}).`,
);
