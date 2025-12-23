/**
 * git auth command - launch GitHub OAuth flow via Fathym.
 *
 * Mirrors the legacy CLI behavior of opening https://www.fathym.com/.oauth/GitHubOAuth
 * with either the active enterprise lookup or its parent enterprise.
 *
 * @module
 */

import { Command, CommandParams, type CommandStatus } from "@fathym/cli";
import { z } from "zod";
import { UrlOpener } from "../../src/services/UrlOpener.ts";
import {
  FathymApiClient,
  FathymConfigStore,
} from "../../src/services/.exports.ts";

/**
 * Result data for the git auth command.
 */
export interface GitAuthResult {
  /** The URL that was opened */
  url: string;
  /** Whether the URL was successfully opened */
  opened: boolean;
}

const AuthArgsSchema = z.tuple([]);

const AuthFlagsSchema = z.object({
  edit: z
    .boolean()
    .optional()
    .describe("Open the OAuth management page (forces edit mode)."),
  self: z
    .boolean()
    .optional()
    .describe("Use the active enterprise lookup instead of the parent."),
});

class GitAuthCommandParams extends CommandParams<
  z.infer<typeof AuthArgsSchema>,
  z.infer<typeof AuthFlagsSchema>
> {
  public get ForceEdit(): boolean {
    return this.Flag("edit") ?? false;
  }

  public get UseSelf(): boolean {
    return this.Flag("self") ?? false;
  }
}

type GitAuthServices = {
  Config: FathymConfigStore;
  Api: FathymApiClient;
  Opener: UrlOpener;
};

type EaCResponse = {
  Model?: {
    Enterprise?: {
      ParentEnterpriseLookup?: string;
    };
  };
};

const OAUTH_BASE = "https://www.fathym.com/.oauth/GitHubOAuth";

export default Command(
  "Git Authentication",
  "Authenticate git access via Fathym",
)
  .Args(AuthArgsSchema)
  .Flags(AuthFlagsSchema)
  .Params(GitAuthCommandParams)
  .Services(async (_ctx, ioc): Promise<GitAuthServices> => {
    const config = await ioc.Resolve(FathymConfigStore);
    const api = await ioc.Resolve(FathymApiClient);

    let opener: UrlOpener;
    try {
      opener = await ioc.Resolve(UrlOpener);
    } catch {
      opener = new UrlOpener();
    }

    return { Config: config, Api: api, Opener: opener };
  })
  .Run(
    async (
      { Services, Params, Log },
    ): Promise<CommandStatus<GitAuthResult>> => {
      const activeLookup = await Services.Config.GetActiveEnterpriseLookup();
      if (!activeLookup) {
        throw new Error(
          "Active enterprise not configured. Run 'ftm eac init' (or equivalent) to select one.",
        );
      }

      let query: string;
      if (Params.ForceEdit) {
        query = "oauth-force-edit=true";
      } else {
        const targetLookup = await resolveTargetEnterprise(
          Services,
          activeLookup,
          Params.UseSelf,
        );
        query = `entLookup=${encodeURIComponent(targetLookup)}`;
      }

      const url = `${OAUTH_BASE}?${query}`;
      Log.Info(`Opening GitHub OAuth flow: ${url}`);
      await Services.Opener.Open(url);

      return {
        Code: 0,
        Message: `Opened GitHub OAuth flow`,
        Data: {
          url,
          opened: true,
        },
      };
    },
  );

async function resolveTargetEnterprise(
  services: GitAuthServices,
  activeLookup: string,
  useSelf: boolean,
): Promise<string> {
  if (useSelf) {
    return activeLookup;
  }

  const response = await services.Api.GetJson<EaCResponse>(
    `${activeLookup}/eac`,
  );
  const parent = response?.Model?.Enterprise?.ParentEnterpriseLookup;

  if (!parent) {
    throw new Error(
      "Parent enterprise lookup not found. Re-run with --self to use the active enterprise.",
    );
  }

  return parent;
}
