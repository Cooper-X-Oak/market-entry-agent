import type { Connector, ConnectorRequest, ConnectorResult } from '@imea/connectors';
import { ConnectorError } from '@imea/connectors';

export class ToolRegistry {
  constructor(private readonly connectors: ReadonlyMap<string, Connector>) {}

  async execute(type: string, request: ConnectorRequest): Promise<ConnectorResult> {
    const connector = this.connectors.get(type);
    if (!connector) throw new ConnectorError('CONNECTOR_UNAVAILABLE', `Connector is not configured: ${type}`, false);
    return connector.execute(request);
  }
}
