import { lambdaService } from './lambdaService';
import type { 
  Account, 
  LoginCredentials, 
  LoginResponse 
} from './types';

class UserService {
  // Login user using Lambda
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      const response = await lambdaService.login(credentials.username, credentials.password);
      
      // Check if we have a token (successful login)
      if (response.token) {
        // Set the token for future requests
        lambdaService.setToken(response.token);
        
        return {
          success: true,
          user: {
            username: credentials.username, // Use the provided username since Lambda doesn't return it
            role: response.role,
            playerId: response.playerId ? response.playerId.toString() : null,
          },
        };
      } else {
        return {
          success: false,
          error: response.error || 'Invalid username or password',
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'An error occurred during login',
      };
    }
  }

  // Authenticate current user
  async authMe(token: string): Promise<LoginResponse> {
    try {
      const response = await lambdaService.authMe(token);
      
      // Check if we have role information (successful auth)
      if (response.role) {
        return {
          success: true,
          user: {
            username: response.sub || 'admin', // Use 'sub' field or default to 'admin'
            role: response.role,
            playerId: response.playerId ? response.playerId.toString() : null,
          },
        };
      } else {
        return {
          success: false,
          error: response.error || 'Authentication failed',
        };
      }
    } catch (error) {
      console.error('Auth me error:', error);
      return {
        success: false,
        error: 'An error occurred during authentication',
      };
    }
  }

  // Get account by username
  async getAccount(username: string): Promise<Account | null> {
    try {
      const response = await lambdaService.listAccounts();
      const account = response.accounts?.find((u: any) => u.username === username);
      return account || null;
    } catch (error) {
      console.error('Get account error:', error);
      return null;
    }
  }

  // Get all accounts (for admin purposes)
  async getAllAccounts(): Promise<Omit<Account, 'password'>[]> {
    try {
      const response = await lambdaService.listAccounts();
      // Remove passwords from response
      return response.accounts?.map(({ password: _, ...account }: any) => account) || [];
    } catch (error) {
      console.error('Get all accounts error:', error);
      return [];
    }
  }

  // Create new account (admin only)
  async createAccount(account: Account): Promise<boolean> {
    try {
      if (account.playerId === null) {
        throw new Error('Player ID is required for account creation');
      }
      
      const response = await lambdaService.createAccount({
        username: account.username,
        password: account.password,
        name: account.name,
        surname: account.surname,
        role: account.role,
        playerId: account.playerId,
        category: account.category,
      });
      // Check for success message or account object in response
      return response.message === "Account created successfully" || !!response.account;
    } catch (error) {
      console.error('Create account error:', error);
      return false;
    }
  }

  // Update account (admin only)
  async updateAccount(username: string, updates: Partial<Account>): Promise<boolean> {
    try {
      const response = await lambdaService.updateAccount(username, updates);
      // Check for success message or success field
      return response.message?.includes("successfully") || response.success || false;
    } catch (error) {
      console.error('Update account error:', error);
      return false;
    }
  }

  // Delete account (admin only)
  async deleteAccount(username: string): Promise<boolean> {
    try {
      const response = await lambdaService.deleteAccount(username);
      // Check for success message or success field
      return response.message?.includes("successfully") || response.success || false;
    } catch (error) {
      console.error('Delete account error:', error);
      return false;
    }
  }
}

export const userService = new UserService();
