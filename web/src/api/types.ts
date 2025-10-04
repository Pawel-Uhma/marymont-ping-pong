// API Types
export interface User {
  id: string;
  username: string;
  password: string; // In production, this should be hashed
  email?: string;
  createdAt: string;
  lastLogin?: string;
  profile?: {
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
}

export interface UsersData {
  users: User[];
  lastUpdated: string;
}

export interface S3Config {
  bucketName: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  error?: string;
}

