import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

export interface ObjectStorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export class ObjectStorageConnector {
  private readonly client: S3Client;
  constructor(private readonly options: ObjectStorageOptions) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  async health(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
  }

  async put(tenantId: string, missionId: string, category: string, content: Uint8Array | string, contentType: string): Promise<{ objectKey: string; contentHash: string }> {
    const body = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content);
    const contentHash = createHash('sha256').update(body).digest('hex');
    const objectKey = `${tenantId}/${missionId}/${category}/${contentHash}`;
    await this.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: objectKey, Body: body, ContentType: contentType, Metadata: { contentHash } }));
    return { objectKey, contentHash };
  }

  async get(objectKey: string): Promise<Uint8Array> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }));
    if (!response.Body) throw new Error(`Object body missing: ${objectKey}`);
    return response.Body.transformToByteArray();
  }
}
