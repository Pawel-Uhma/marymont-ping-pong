// S3 JSON Storage Service
// Connects to actual S3 bucket with the specified structure

import type { S3Config } from './types';

class S3Service {
  private config: S3Config;
  private isDevelopment: boolean;
  private baseUrl: string;

  constructor(config: S3Config) {
    this.config = config;
    this.isDevelopment = import.meta.env.DEV;
    // Direct S3 bucket URL
    this.baseUrl = `https://${config.bucketName}.s3.${config.region}.amazonaws.com`;
  }

  // Get object from S3
  async getObject(key: string): Promise<unknown> {
    try {
      const url = `${this.baseUrl}/${key}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Object not found: ${key}`);
        }
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('S3 GET error:', error);
      throw error;
    }
  }

  // Put object to S3
  async putObject(key: string, data: unknown): Promise<void> {
    try {
      const url = `${this.baseUrl}/${key}`;
      const response = await fetch(url, {
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

  // Delete object from S3
  async deleteObject(key: string): Promise<void> {
    try {
      const url = `${this.baseUrl}/${key}`;
      const response = await fetch(url, {
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

  // Check if object exists
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.getObject(key);
      return true;
    } catch {
      return false;
    }
  }

  // Helper method to build S3 keys based on the structure
  getAccountsKey(): string {
    return 'accounts.json';
  }

  getPlayersKey(category: 'man' | 'woman'): string {
    return `data/${category}/players.json`;
  }

  getGroupsKey(category: 'man' | 'woman'): string {
    return `data/${category}/groups.json`;
  }

  getGroupMatchesKey(category: 'man' | 'woman'): string {
    return `data/${category}/matches_group.json`;
  }

  getEliminationMatchesKey(category: 'man' | 'woman'): string {
    return `data/${category}/matches_elim.json`;
  }

  getStandingsKey(category: 'man' | 'woman'): string {
    return `data/${category}/standings_group.json`;
  }

  getBracketKey(category: 'man' | 'woman'): string {
    return `data/${category}/bracket.json`;
  }
}

// Create singleton instance
const s3Config: S3Config = {
  bucketName: 'marymont-ping-pong',
  region: 'eu-north-1',
};

export const s3Service = new S3Service(s3Config);
