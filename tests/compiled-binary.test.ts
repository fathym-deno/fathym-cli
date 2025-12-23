import { assertMatch } from "jsr:@std/assert@1.0.3";
import { join } from "@std/path";

// Cross-platform binary name detection
const BINARY_NAME = Deno.build.os === "windows" ? "my-cli.exe" : "my-cli";

const COMPILED_BINARY = join(
  Deno.cwd(),
  "tests/.temp/my-cli/.dist/exe",
  BINARY_NAME,
);

async function runCompiledCLI(args: string[]): Promise<string> {
  const command = new Deno.Command(COMPILED_BINARY, {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, stderr } = await command.output();
  const output = new TextDecoder().decode(stdout);
  const errors = new TextDecoder().decode(stderr);

  return output + errors;
}

Deno.test("Compiled Binary – root help shows groups", async () => {
  const output = await runCompiledCLI(["--help"]);

  assertMatch(output, /My CLI/i);
  assertMatch(output, /Usage:/i);
  assertMatch(output, /Available Commands/i);
  assertMatch(output, /hello/i);
  assertMatch(output, /Available Groups/i);
  assertMatch(output, /secondary/i);
});

Deno.test("Compiled Binary – group help shows child commands", async () => {
  const output = await runCompiledCLI(["secondary", "--help"]);

  assertMatch(output, /Group: secondary/i);
  assertMatch(output, /Secondary commands/i);
  assertMatch(output, /Available Commands/i);
  assertMatch(output, /wave/i);
});

Deno.test("Compiled Binary – nested command help works", async () => {
  const output = await runCompiledCLI(["secondary/wave", "--help"]);

  assertMatch(output, /Wave/i);
  assertMatch(output, /Waves at a friend/i);
  assertMatch(output, /--excited/i);
  assertMatch(output, /--dry-run/i);
});

Deno.test("Compiled Binary – nested command executes", async () => {
  const output = await runCompiledCLI(["secondary/wave", "tester"]);

  assertMatch(output, /Waving at tester/i);
});
