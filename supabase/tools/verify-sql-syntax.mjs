import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.argv[2];
if (!modulePath) {
  throw new Error("Pass the absolute pg-query-emscripten/pg_query.js path.");
}

const { default: PgQueryModule } = await import(pathToFileURL(modulePath).href);
const supabaseDirectory = path.resolve(import.meta.dirname, "..");

function splitSql(source) {
  const statements = [];
  let start = 0;
  let index = 0;
  let state = "normal";
  let dollarTag = "";
  let blockDepth = 0;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (current === "\n") state = "normal";
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (current === "/" && next === "*") {
        blockDepth += 1;
        index += 2;
      } else if (current === "*" && next === "/") {
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) state = "normal";
      } else {
        index += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      if (current === "'" && next === "'") {
        index += 2;
      } else if (current === "'") {
        state = "normal";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }
    if (state === "double-quote") {
      if (current === '"' && next === '"') {
        index += 2;
      } else if (current === '"') {
        state = "normal";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        state = "normal";
      } else {
        index += 1;
      }
      continue;
    }

    if (current === "-" && next === "-") {
      state = "line-comment";
      index += 2;
    } else if (current === "/" && next === "*") {
      state = "block-comment";
      blockDepth = 1;
      index += 2;
    } else if (current === "'") {
      state = "single-quote";
      index += 1;
    } else if (current === '"') {
      state = "double-quote";
      index += 1;
    } else if (current === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        state = "dollar-quote";
        index += dollarTag.length;
      } else {
        index += 1;
      }
    } else if (current === ";") {
      const statement = source.slice(start, index + 1).trim();
      if (statement) statements.push(statement);
      start = index + 1;
      index += 1;
    } else {
      index += 1;
    }
  }

  const trailing = source.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements;
}

const sqlFiles = [
  ...fs.readdirSync(path.join(supabaseDirectory, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => path.join(supabaseDirectory, "migrations", name)),
  ...fs.readdirSync(path.join(supabaseDirectory, "tests"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => path.join(supabaseDirectory, "tests", name)),
];

let failed = false;
for (const file of sqlFiles.sort()) {
  const statements = splitSql(fs.readFileSync(file, "utf8"));
  for (let statementIndex = 0; statementIndex < statements.length; statementIndex += 1) {
    const parser = await new PgQueryModule();
    const result = parser.parse(statements[statementIndex]);
    if (result.error) {
      failed = true;
      console.error(`${path.basename(file)} statement ${statementIndex + 1}: ${JSON.stringify(result.error)}`);
    }
  }
  if (!failed) console.log(`${path.basename(file)}: ${statements.length} statements parsed`);
}

process.exitCode = failed ? 1 : 0;
