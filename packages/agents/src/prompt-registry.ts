import type { PromptVersion } from './types.js';

const evidenceProtocol = `
所有重要判断必须引用 evidenceRefs。严格区分 observed、inferred、unknown 和 contradiction。
不得把搜索摘要当作最终事实；优先使用官方来源，并记录反向证据。
证据不足时输出 Unknown，不得捏造组织、人员、联系方式、项目或交易事实。`;

export class PromptRegistry {
  private readonly versions = new Map<string, PromptVersion>();

  constructor(initialVersions: readonly PromptVersion[] = []) {
    for (const version of initialVersions) this.versions.set(version.skillKey, version);
  }

  active(skillKey: string): PromptVersion {
    return this.versions.get(skillKey) ?? {
      id: `built-in:${skillKey}:1`,
      skillKey,
      version: 1,
      systemTemplate: `你是工业品出海市场进入系统中的边界化 Agent Skill。${evidenceProtocol}`,
      inputSchemaVersion: 1,
      outputSchemaVersion: 1,
      modelConfig: {},
    };
  }

  register(version: PromptVersion): void {
    const current = this.versions.get(version.skillKey);
    if (!current || version.version > current.version) this.versions.set(version.skillKey, version);
  }
}
