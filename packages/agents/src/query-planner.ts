export interface ResearchQuestion {
  businessQuestion: string;
  targetEntityType: string;
  country: string;
  languages: string[];
  expectedSourceType: string;
  priority: number;
  maximumResults: number;
}

export interface PlannedQuery extends ResearchQuestion {
  query: string;
  language: string;
}

export class ResearchQueryPlanner {
  plan(question: ResearchQuestion, templates: readonly string[]): PlannedQuery[] {
    return question.languages.flatMap((language) => templates.map((template) => ({
      ...question,
      language,
      query: template.replaceAll('{country}', question.country).replaceAll('{businessQuestion}', question.businessQuestion),
    })));
  }
}
