import { CLIIntentSuite } from "@fathym/cli";

// Help intent suite validates root and command-level help output
// for the scaffolded tests/.temp/my-cli project.
// Path is relative to cwd (project root) since that's where tests run from
CLIIntentSuite("Help Command Suite", "./tests/.temp/my-cli/.cli.ts")
  // Root help - verify groups appear
  .Intent("Show root help", (int) =>
    int
      .Args(["--help"])
      .ExpectLogs(
        "My CLI", // CLI name from .cli.ts
        "Usage:",
        "Available Commands",
        "hello - hello - Prints a friendly greeting.",
        "manage - manage - Show management status and options.",
        "Available Groups",
        "manage - manage - Management utilities and operations",
        "secondary - secondary - Secondary commands",
      )
      .ExpectExit(0))
  // hello command help
  .Intent("Show 'hello' command help", (int) =>
    int
      .Args(["hello", "--help"])
      .ExpectLogs(
        "Prints a friendly greeting.",
        "Args:",
        "<name> - Name to greet",
        "Flags:",
        "--loud - Shout the greeting",
        "--dry-run - Show the message without printing",
      )
      .ExpectExit(0))
  // Group help - verify group metadata and child commands
  .Intent("Show 'secondary' group help", (int) =>
    int
      .Args(["secondary", "--help"])
      .ExpectLogs(
        "Group: secondary",
        "Secondary commands for additional functionality",
        "Available Commands",
        "wave - Wave - Waves at a friend",
      )
      .ExpectExit(0))
  // Nested command help - wave is now under secondary group
  .Intent("Show 'secondary/wave' command help", (int) =>
    int
      .Args(["secondary/wave", "--help"])
      .ExpectLogs(
        "Waves at a friend with optional excitement.",
        "Args:",
        "<target> - Name to wave at",
        "Flags:",
        "--excited - Add extra enthusiasm to the wave",
        "--dry-run - Show the wave without printing it",
      )
      .ExpectExit(0))
  // === Same-named command and group tests ===
  // When a key is both a command AND a group, --help shows command help
  // Use manage/users to access subcommands
  .Intent("Show 'manage' command help (same-named key)", (int) =>
    int
      .Args(["manage", "--help"])
      .ExpectLogs(
        // Command section only - framework doesn't show group subcommands here
        "Show management status and options.",
        "Flags:",
        "--verbose - Show detailed output",
        "--dry-run - Show what would be done without doing it",
      )
      .ExpectExit(0))
  // Subcommand within same-named group
  .Intent("Show 'manage/users' command help", (int) =>
    int
      .Args(["manage/users", "--help"])
      .ExpectLogs(
        "List and manage users.",
        "Flags:",
        "--all - Show all users including inactive",
        "--dry-run - Show what would be done without doing it",
      )
      .ExpectExit(0))
  .Run();
