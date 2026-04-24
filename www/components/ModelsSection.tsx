import * as React from "react";
import { LabMark, MODEL_LAB_ENTRIES, type ModelLabEntry } from "./LabIcons";

/**
 * Models section, a dense, spec-sheet style listing of every
 * supported frontier family. Keeps the x.ai "data-forward" aesthetic.
 */

interface FamilyRow {
  lab: ModelLabEntry;
  family: string;
  examples: string;
  context: string;
  flags: string[];
}

const FAMILIES: FamilyRow[] = [
  {
    lab: MODEL_LAB_ENTRIES[0], // Anthropic
    family: "Claude 4.6",
    examples: "Opus, Sonnet",
    context: "200K",
    flags: ["reasoning", "vision", "tools", "pdf"],
  },
  {
    lab: MODEL_LAB_ENTRIES[1], // OpenAI
    family: "GPT-5.2 / OSS",
    examples: "GPT-5.2, OSS 120B, OSS 20B",
    context: "128K",
    flags: ["reasoning", "vision", "image-gen", "tools"],
  },
  {
    lab: MODEL_LAB_ENTRIES[2], // Google
    family: "Gemini 3",
    examples: "Flash, Pro",
    context: "1M",
    flags: ["fast", "vision", "audio", "tools"],
  },
  {
    lab: MODEL_LAB_ENTRIES[3], // xAI
    family: "Grok 4",
    examples: "4.20, 4.1 Fast, Code Fast, 3 Mini",
    context: "2M",
    flags: ["reasoning", "vision", "tools"],
  },
  {
    lab: MODEL_LAB_ENTRIES[4], // DeepSeek
    family: "DeepSeek V3.2",
    examples: "V3.2",
    context: "164K",
    flags: ["reasoning", "tools"],
  },
  {
    lab: MODEL_LAB_ENTRIES[5], // Meta
    family: "Llama 3.1",
    examples: "405B, 8B Instant",
    context: "131K",
    flags: ["reasoning", "tools"],
  },
  {
    lab: MODEL_LAB_ENTRIES[6], // Moonshot
    family: "Kimi K2",
    examples: "K2.5, K2",
    context: "262K",
    flags: ["reasoning", "vision", "tools"],
  },
  {
    lab: MODEL_LAB_ENTRIES[7], // Z.ai
    family: "GLM-5",
    examples: "GLM-5",
    context: "131K",
    flags: ["vision", "tools"],
  },
  {
    lab: MODEL_LAB_ENTRIES[8], // MiniMax
    family: "MiniMax M2.5",
    examples: "M2.5",
    context: "131K",
    flags: ["fast", "tools"],
  },
];

export const ModelsSection: React.FC = () => (
  <section id="models" className="site-models">
    <div className="site-section__lead">
      <div className="site-section__tag">/ models</div>
      <h2 className="site-section__title">
        Every frontier family, behind a single input.
      </h2>
      <p className="site-section__sub">
        Switch between labs mid-thread. Keep the context. Keep the history.
      </p>
    </div>

    <div className="site-models__table">
      <header className="site-models__head">
        <div>Lab</div>
        <div>Family</div>
        <div>Variants</div>
        <div>Context</div>
        <div className="site-models__flags-head">Capabilities</div>
      </header>

      {FAMILIES.map((row) => (
        <div className="site-models__row" key={row.family}>
          <div className="site-models__lab">
            <LabMark lab={row.lab} width={18} height={18} />
            <span>{row.lab.label}</span>
          </div>
          <div className="site-models__family">{row.family}</div>
          <div className="site-models__variants">{row.examples}</div>
          <div className="site-models__ctx">{row.context}</div>
          <div className="site-models__flags">
            {row.flags.map((f) => (
              <span key={f} className="site-models__flag">
                {f}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  </section>
);
