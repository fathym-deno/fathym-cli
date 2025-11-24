import { CommandIntent } from '../../test.deps.ts';
import BuildCommand from '../../../commands/build.ts';
import CompileCommand from '../../../commands/compile.ts';
import InstallCommand from '../../../commands/install.ts';

CommandIntent(
  'Prepare ftm-cli: build',
  BuildCommand.Build(),
  import.meta.resolve('../../../.cli.json'),
)
  .Args([])
  .Flags({
    config: './.cli.json',
  })
  .ExpectLogs(
    '📦 Embedded templates →',
    '📘 Embedded command entries →',
    '🧩 Scaffolder rendered build-static template to ./.build',
    'Build complete! Run `ftm compile` on .build/cli.ts to finalize.',
  )
  .ExpectExit(0)
  .Run();

CommandIntent(
  'Prepare ftm-cli: compile',
  CompileCommand.Build(),
  import.meta.resolve('../../../.cli.json'),
)
  .Args([])
  .Flags({
    entry: './.build/cli.ts',
  })
  .ExpectLogs(
    '🔧 Compiling CLI for:',
    '✅ Compiled:',
    '👉 To install, run: `your-cli install --from',
  )
  .ExpectExit(0)
  .Run();

CommandIntent(
  'Prepare ftm-cli: install',
  InstallCommand.Build(),
  import.meta.resolve('../../../.cli.json'),
)
  .Args([])
  .Flags({
    config: './.cli.json',
    useHome: true,
  })
  .ExpectLogs(
    '✅ Installed: ', // main binary copy success
    '🎉 CLI installed successfully', // final success message
  )
  .ExpectExit(0)
  .Run();
