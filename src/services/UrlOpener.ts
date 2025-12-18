const decoder = new TextDecoder();

/**
 * Cross-platform helper for opening URLs in the user's default browser.
 */
export class UrlOpener {
  public async Open(url: string): Promise<void> {
    const os = Deno.build.os;
    let command: string;
    let args: string[];

    if (os === 'windows') {
      command = 'cmd';
      args = ['/c', 'start', '', url];
    } else if (os === 'darwin') {
      command = 'open';
      args = [url];
    } else {
      command = 'xdg-open';
      args = [url];
    }

    const process = new Deno.Command(command, {
      args,
      stdin: 'null',
      stdout: 'null',
      stderr: 'piped',
    });

    const result = await process.output();
    if (!result.success) {
      const errorText = decoder.decode(result.stderr ?? new Uint8Array()).trim();
      throw new Error(
        `Failed to open ${url}${errorText ? `: ${errorText}` : ''}`,
      );
    }
  }
}
