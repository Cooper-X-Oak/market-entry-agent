import {
  actionCardResultSchema,
  agentTaskOutputSchema,
  capabilityExtractionResultSchema,
  contactPathResultSchema,
  ecosystemMapResultSchema,
  marketRouteResearchResultSchema,
  missionBriefSchema,
  opportunityQualificationResultSchema,
  stakeholderMapResultSchema,
  targetRankingResultSchema,
  type AgentTaskInput,
} from '@imea/contracts';
import type { ConnectorRequest } from '@imea/connectors';
import { competitorResearchResultSchema, entityResolutionResultSchema, expertSignalResearchResultSchema, interactionInterpretationResultSchema } from './schemas.js';
import type { AgentSkill } from './types.js';

function query(input: AgentTaskInput, operation: string, queryText: string, connectorType = 'web_search', maxResults = 4): ConnectorRequest {
  return { tenantId: input.tenantId, missionId: input.missionId, operation, query: queryText, options: { connectorType, maxResults } };
}

function localize(input: AgentTaskInput, suffixes: string[], maxResults = 4): ConnectorRequest[] {
  return suffixes.map((suffix) => query(input, 'search', `${input.objective} ${suffix}`, 'web_search', maxResults));
}

const common = {
  proposedClaims: [], unknowns: [], contradictions: [], recommendedEvents: [],
  quality: { schemaValid: true, evidenceCoverage: 100, confidence: 80 },
};

export const missionCompilerSkill: AgentSkill = {
  key: 'mission_compiler', name: 'Mission Compiler', objective: '把稀疏用户输入编译为结构化任务卡',
  instructions: '只把用户需求编译为研究计划。委托方不等于供应方，研究产品不等于供货能力。保留 researchDefinition 的城市/国家边界及主体语义。没有上下文公开证据时 proposedClaims、knownFacts、contradictions 必须为空；用户陈述只用于任务定义，待研究判断放 initialAssumptions/openQuestions/unknowns。供应方缺失标记能力匹配未评估，不阻断客户研究。禁止创造或猜测 evidenceRefs。',
  outputSchema: agentTaskOutputSchema(missionBriefSchema), maxResearchLoops: 1, permittedConnectors: [], planQueries: () => [],
};

export const capabilityEvidenceExtractorSkill: AgentSkill = {
  key: 'capability_evidence_extractor', name: 'Capability Evidence Extractor', objective: '从企业来源提取能力证据账本',
  instructions: '仅根据当前 Source Snapshot 提取产品、应用、认证、制造、交付、服务、地域、渠道、定价、案例与定制能力。缺失项输出 Unknown。',
  outputSchema: agentTaskOutputSchema(capabilityExtractionResultSchema), maxResearchLoops: 2, permittedConnectors: ['company_website', 'browser', 'document'],
  planQueries: (input) => { const url = input.knownClaims.find((claim) => claim.statement.startsWith('website:'))?.statement.slice(8); const documents = input.knownClaims.filter((claim) => claim.statement.startsWith('document:')).flatMap((claim) => { const [name, objectKey] = claim.statement.slice(9).split('|'); if (!objectKey) return []; const extension = name?.split('.').pop()?.toLowerCase(); const operation = extension && ['pdf','docx','xlsx','pptx'].includes(extension) ? `parse_${extension}` : 'parse_pdf'; return [{ tenantId: input.tenantId, missionId: input.missionId, operation, options: { connectorType: 'document', objectKey } }]; }); return [...(url ? [{ tenantId: input.tenantId, missionId: input.missionId, operation: 'fetch_page', url, options: { connectorType: 'browser' } }, { tenantId: input.tenantId, missionId: input.missionId, operation: 'discover_product_pages', url, options: { connectorType: 'company_website' } }, { tenantId: input.tenantId, missionId: input.missionId, operation: 'discover_certification_pages', url, options: { connectorType: 'company_website' } }] : []), ...documents]; },
};

export const marketRouteResearcherSkill: AgentSkill = {
  key: 'market_route_researcher', name: 'Market Route Researcher', objective: '研究三至八条可解释的市场进入路线',
  instructions: '覆盖渠道、直采、EPC、招投标、展会、协会、专家网络或混合路线。每条路线说明适用场景、组织类型、角色、渠道、能力要求、证据、反证、成本和优先级。',
  outputSchema: agentTaskOutputSchema(marketRouteResearchResultSchema), maxResearchLoops: 4, evidenceStopThreshold: 12, permittedConnectors: ['web_search', 'browser', 'tender_search'],
  planQueries: (input) => localize(input, ['distributor procurement model', 'supplier registration EPC contractors', 'tender award', 'trade association exhibition exhibitors'], 4),
};

export const competitorResearcherSkill: AgentSkill = {
  key: 'competitor_researcher', name: 'Competitor Researcher', objective: '研究竞争对手在目标市场的进入方式',
  instructions: '识别三至八个竞争对手，记录当地页面、办公室、渠道、展会、公开项目、认证、服务网络、市场门槛和可超越空间。',
  outputSchema: agentTaskOutputSchema(competitorResearchResultSchema), maxResearchLoops: 4, evidenceStopThreshold: 6, permittedConnectors: ['web_search', 'browser'],
  planQueries: (input) => localize(input, ['competitors local distributors', 'competitor public project partner'], 3),
};

export const expertSignalResearcherSkill: AgentSkill = {
  key: 'expert_signal_researcher', name: 'Expert Signal Researcher', objective: '发现行业观点与专家线索',
  instructions: '记录观点时间、来源、与交易的距离、可信度、商业立场、市场影响和公开触达可能性。',
  outputSchema: agentTaskOutputSchema(expertSignalResearchResultSchema), maxResearchLoops: 3, evidenceStopThreshold: 6, permittedConnectors: ['web_search', 'browser', 'social_public_search'],
  planQueries: (input) => localize(input, ['market expert procurement challenges', 'distributor perspective conference speaker'], 3),
};

export const ecosystemMapperSkill: AgentSkill = {
  key: 'ecosystem_mapper', name: 'Ecosystem Mapper', objective: '建立实体与业务关系图谱',
  instructions: '围绕已批准路线发现终端、进口商、经销商、EPC、设计机构、协会、展会、专家、服务商、竞争对手和公开项目，并为每条关系附证据。',
  outputSchema: agentTaskOutputSchema(ecosystemMapResultSchema), maxResearchLoops: 4, evidenceStopThreshold: 8, permittedConnectors: ['web_search', 'browser', 'tender_search', 'social_public_search'],
  planQueries: (input) => localize(input, ['industry ecosystem organizations', 'importer distributor EPC', 'association exhibition project'], 3),
};

export const targetRankerSkill: AgentSkill = {
  key: 'target_ranker', name: 'Target Ranker', objective: '从生态候选中形成可解释的目标组织排序',
  instructions: '只返回当前任务上下文中已有的组织名称或官网。按产品适配、路线适配、需求信号、可触达性和证据质量评分；每个目标必须引用证据，优先形成十个可供业务选择的目标。',
  outputSchema: agentTaskOutputSchema(targetRankingResultSchema), maxResearchLoops: 3, evidenceStopThreshold: 10, permittedConnectors: ['web_search', 'browser'],
  planQueries: (input) => localize(input, ['official organization product market fit', 'official procurement supplier registration', 'official distributor EPC end user'], 4),
};

export const entityResolverSkill: AgentSkill = {
  key: 'entity_resolver', name: 'Entity Resolver', objective: '完成实体消歧',
  instructions: '依次比较官方域名、注册编号、名称、国家城市地址、社交主页和别名，输出 create、merge 或 link，并保存理由。',
  outputSchema: agentTaskOutputSchema(entityResolutionResultSchema), maxResearchLoops: 1, permittedConnectors: ['browser'], planQueries: () => [],
};

export const stakeholderMapperSkill: AgentSkill = {
  key: 'stakeholder_mapper', name: 'Stakeholder Mapper', objective: '映射组织内部的利益相关角色',
  instructions: '识别使用者、技术影响者、采购、预算、审批、供应商准入、渠道、服务、项目及转介绍节点。允许人员未知但部门已知。',
  outputSchema: agentTaskOutputSchema(stakeholderMapResultSchema), maxResearchLoops: 3, evidenceStopThreshold: 6, permittedConnectors: ['web_search', 'browser', 'social_public_search'],
  planQueries: (input) => localize(input, ['procurement engineering team', 'supplier qualification channel partnership'], 3),
};

export const contactPathFinderSkill: AgentSkill = {
  key: 'contact_path_finder', name: 'Contact Path Finder', objective: '发现公开商务触达路径',
  instructions: '官方来源优先；为高优先级目标给出主要路径、备用路径、关联角色、公开属性、来源位置、语言、时区和推荐顺序。禁止猜测私人联系方式。',
  outputSchema: agentTaskOutputSchema(contactPathResultSchema), maxResearchLoops: 4, evidenceStopThreshold: 6, permittedConnectors: ['web_search', 'browser', 'social_public_search', 'contact_verification'],
  planQueries: (input) => localize(input, ['official procurement contact', 'supplier registration contact', 'team purchasing manager'], 3),
};

export const opportunityQualifierSkill: AgentSkill = {
  key: 'opportunity_qualifier', name: 'Opportunity Qualifier', objective: '判断机会资格并给出透明评分',
  instructions: '依据产品适配、路线适配、需求、时机、利益角色、可触达性、证据质量、战略价值评分，并估计价值区间与销售资源。',
  outputSchema: agentTaskOutputSchema(opportunityQualificationResultSchema), maxResearchLoops: 2, permittedConnectors: [], planQueries: () => [],
};

export const actionCardBuilderSkill: AgentSkill = {
  key: 'action_card_builder', name: 'Action Card Builder', objective: '生成可直接执行的市场进入行动卡',
  instructions: '基于已确认企业能力、机会和公开触达证据生成行动卡。存在已验证公开联系方式时生成 outreach 卡；缺少可用公开联系方式时生成 research 卡，明确联系人研究目标、未知项、研究步骤和成功信号。只输出业务内容，内部数据库标识由服务端绑定。',
  outputSchema: agentTaskOutputSchema(actionCardResultSchema), maxResearchLoops: 2, permittedConnectors: [], planQueries: () => [],
};

export const interactionInterpreterSkill: AgentSkill = {
  key: 'interaction_interpreter', name: 'Interaction Interpreter', objective: '把真实互动转化为事实和下一步动作',
  instructions: '保留用户原始输入来源，提取新事实，更新联系方式、路线置信度和机会状态，并判断是否需要新行动卡版本。',
  outputSchema: agentTaskOutputSchema(interactionInterpretationResultSchema), maxResearchLoops: 2, permittedConnectors: [], planQueries: () => [],
};

export const skillCatalog: readonly AgentSkill[] = [missionCompilerSkill, capabilityEvidenceExtractorSkill, marketRouteResearcherSkill, competitorResearcherSkill, expertSignalResearcherSkill, ecosystemMapperSkill, targetRankerSkill, entityResolverSkill, stakeholderMapperSkill, contactPathFinderSkill, opportunityQualifierSkill, actionCardBuilderSkill, interactionInterpreterSkill];

export { common as emptyAgentOutputFields };
