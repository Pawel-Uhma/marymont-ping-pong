// S3 JSON Storage Service
// This simulates S3 operations by using localStorage for development
// In production, this would connect to actual S3 buckets

import type { S3Config } from './types';

class S3Service {
  private config: S3Config;
  private isDevelopment: boolean;

  constructor(config: S3Config) {
    this.config = config;
    this.isDevelopment = import.meta.env.DEV;
  }

  // Simulate S3 GET operation
  async getObject(key: string): Promise<unknown> {
    if (this.isDevelopment) {
      // Use localStorage for development
      const data = localStorage.getItem(`s3_${this.config.bucketName}_${key}`);
      if (!data) {
        throw new Error(`Object not found: ${key}`);
      }
      return JSON.parse(data);
    } else {
      // In production, this would make actual S3 API calls
      // For now, we'll simulate with a fetch call
      try {
        const response = await fetch(`/api/s3/${this.config.bucketName}/${key}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        return await response.json();
      } catch (error) {
        console.error('S3 GET error:', error);
        throw error;
      }
    }
  }

  // Simulate S3 PUT operation
  async putObject(key: string, data: unknown): Promise<void> {
    if (this.isDevelopment) {
      // Use localStorage for development
      localStorage.setItem(`s3_${this.config.bucketName}_${key}`, JSON.stringify(data));
    } else {
      // In production, this would make actual S3 API calls
      try {
        const response = await fetch(`/api/s3/${this.config.bucketName}/${key}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          throw new Error(`Failed to upload: ${response.statusText}`);
        }
      } catch (error) {
        console.error('S3 PUT error:', error);
        throw error;
      }
    }
  }

  // Simulate S3 DELETE operation
  async deleteObject(key: string): Promise<void> {
    if (this.isDevelopment) {
      // Use localStorage for development
      localStorage.removeItem(`s3_${this.config.bucketName}_${key}`);
    } else {
      // In production, this would make actual S3 API calls
      try {
        const response = await fetch(`/api/s3/${this.config.bucketName}/${key}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error(`Failed to delete: ${response.statusText}`);
        }
      } catch (error) {
        console.error('S3 DELETE error:', error);
        throw error;
      }
    }
  }

  // Check if object exists
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.getObject(key);
      return true;
    } catch {
      return false;
    }
  }
}

// Create singleton instance
const s3Config: S3Config = {
  bucketName: 'marymont-ping-pong-data',
  region: 'us-east-1',
};

export const s3Service = new S3Service(s3Config);
