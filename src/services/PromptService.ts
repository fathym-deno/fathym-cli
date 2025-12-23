import {
  Confirm,
  type ConfirmOptions,
  Input,
  type InputOptions,
  Select,
  type SelectOptions,
} from "@cliffy/prompt";

export interface PromptService {
  Input(
    message: string,
    options?: Omit<InputOptions, "message">,
  ): Promise<string>;
  Confirm(
    message: string,
    options?: Omit<ConfirmOptions, "message">,
  ): Promise<boolean>;
  Select<T extends string>(
    message: string,
    options: Omit<SelectOptions<T>, "message">,
  ): Promise<T>;
}

/**
 * Default PromptService implementation powered by @cliffy/prompt.
 */
export class CliffyPromptService implements PromptService {
  public async Input(
    message: string,
    options?: Omit<InputOptions, "message">,
  ): Promise<string> {
    const opts: InputOptions = { ...(options ?? {}), message };
    return await Input.prompt(opts);
  }

  public async Confirm(
    message: string,
    options?: Omit<ConfirmOptions, "message">,
  ): Promise<boolean> {
    const opts: ConfirmOptions = { ...(options ?? {}), message };
    return await Confirm.prompt(opts);
  }

  public async Select<T extends string>(
    message: string,
    options: Omit<SelectOptions<T>, "message">,
  ): Promise<T> {
    const opts: SelectOptions<T> = { ...(options ?? {}), message };
    return await Select.prompt(opts) as T;
  }
}
