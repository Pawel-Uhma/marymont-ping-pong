import { s3Service } from './s3Service';
import type { User, UsersData, LoginCredentials, LoginResponse, RegisterData } from './types';

class UserService {
  private readonly USERS_KEY = 'users.json';

  // Initialize default users if none exist
  private async initializeDefaultUsers(): Promise<void> {
    const exists = await s3Service.objectExists(this.USERS_KEY);
    if (!exists) {
      const defaultUsers: UsersData = {
        users: [
          {
            id: '1',
            username: 'admin',
            password: 'password', // In production, this should be hashed
            email: 'admin@marymont.com',
            createdAt: new Date().toISOString(),
            profile: {
              firstName: 'Admin',
              lastName: 'User',
            },
          },
          {
            id: '2',
            username: 'player1',
            password: 'player123',
            email: 'player1@marymont.com',
            createdAt: new Date().toISOString(),
            profile: {
              firstName: 'John',
              lastName: 'Doe',
            },
          },
        ],
        lastUpdated: new Date().toISOString(),
      };
      await s3Service.putObject(this.USERS_KEY, defaultUsers);
    }
  }

  // Get all users
  private async getUsersData(): Promise<UsersData> {
    await this.initializeDefaultUsers();
    return await s3Service.getObject(this.USERS_KEY);
  }

  // Save users data
  private async saveUsersData(usersData: UsersData): Promise<void> {
    usersData.lastUpdated = new Date().toISOString();
    await s3Service.putObject(this.USERS_KEY, usersData);
  }

  // Generate unique ID
  private generateId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  // Login user
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      const usersData = await this.getUsersData();
      const user = usersData.users.find(
        (u) => u.username === credentials.username && u.password === credentials.password
      );

      if (user) {
        // Update last login
        user.lastLogin = new Date().toISOString();
        await this.saveUsersData(usersData);

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        return {
          success: true,
          user: userWithoutPassword as User,
        };
      } else {
        return {
          success: false,
          error: 'Invalid username or password',
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


  // Get user by ID
  async getUserById(userId: string): Promise<User | null> {
    try {
      const usersData = await this.getUsersData();
      const user = usersData.users.find((u) => u.id === userId);
      return user || null;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  // Update user profile
  async updateUser(userId: string, updates: Partial<User>): Promise<LoginResponse> {
    try {
      const usersData = await this.getUsersData();
      const userIndex = usersData.users.findIndex((u) => u.id === userId);
      
      if (userIndex === -1) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      // Update user data
      usersData.users[userIndex] = {
        ...usersData.users[userIndex],
        ...updates,
      };

      await this.saveUsersData(usersData);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = usersData.users[userIndex];
      return {
        success: true,
        user: userWithoutPassword as User,
      };
    } catch (error) {
      console.error('Update user error:', error);
      return {
        success: false,
        error: 'An error occurred while updating user',
      };
    }
  }

  // Get all users (for admin purposes)
  async getAllUsers(): Promise<User[]> {
    try {
      const usersData = await this.getUsersData();
      // Remove passwords from response
      return usersData.users.map(({ password: _, ...user }) => user as User);
    } catch (error) {
      console.error('Get all users error:', error);
      return [];
    }
  }

  // Delete user
  async deleteUser(userId: string): Promise<boolean> {
    try {
      const usersData = await this.getUsersData();
      const userIndex = usersData.users.findIndex((u) => u.id === userId);
      
      if (userIndex === -1) {
        return false;
      }

      usersData.users.splice(userIndex, 1);
      await this.saveUsersData(usersData);
      return true;
    } catch (error) {
      console.error('Delete user error:', error);
      return false;
    }
  }
}

export const userService = new UserService();
