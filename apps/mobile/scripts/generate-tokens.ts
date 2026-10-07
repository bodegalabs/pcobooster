// Writes src/design/colors.generated.ts from assets/colors. Run: bun run tokens
import { writeFileSync } from "node:fs";

import { generatedPath, renderColorTokens } from "./color-tokens.ts";

writeFileSync(generatedPath, renderColorTokens());
