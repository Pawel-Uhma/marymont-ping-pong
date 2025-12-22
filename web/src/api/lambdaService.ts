// AWS Lambda Service
// Connects to AWS Lambda function that handles S3 operations

interface LambdaResponse<T = any> {
  success?: boolean;
  error?: string;
  data?: T;
  [key: string]: any;
}

interface LambdaRequest {
  action: string;
  payload: any;
}

class LambdaService {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    // TODO: Replace with actual Lambda URL
    this.baseUrl = "https://po22shvefr4dbq5ew3a2e5kkjy0cwaqh.lambda-url.eu-north-1.on.aws/ ";
  }

  // Set authentication token
  setToken(token: string | null) {
    this.token = token;
  }

  // Generic Lambda request method
  private async request<T = any>(action: string, payload: any = {}): Promise<T> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add authorization header if token is available
      if (this.token) {
        headers["Authorization"] = `Bearer ${this.token}`;
      }

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action,
          payload,
        } as LambdaRequest),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }

      return result;
    } catch (error) {
      console.error(`Lambda request error for action ${action}:`, error);
      throw error;
    }
  }

  // Authentication methods
  async authMe(token: string): Promise<LambdaResponse> {
    // Set the token for this request
    const originalToken = this.token;
    this.token = token;
    const result = await this.request("auth.me", {});
    this.token = originalToken; // Restore original token
    return result;
  }

  async login(username: string, password?: string): Promise<LambdaResponse> {
    const trimmedUsername = (username || '').trim();
    if (!trimmedUsername) {
      throw new Error('Username is required');
    }
    const payload: any = { username: trimmedUsername };
    if (password && password.trim()) {
      payload.password = password.trim();
    }
    return this.request("auth.login", payload);
  }

  // Player methods (now work with accounts)
  async listPlayers(category: "man" | "woman"): Promise<LambdaResponse> {
    return this.request("players.list", { category });
  }

  async createPlayer(player: {
    name: string;
    surname: string;
    category: "man" | "woman";
    username: string;
    password: string;
    playerId?: number;
  }): Promise<LambdaResponse> {
    return this.request("accounts.create", player);
  }

  async getPlayer(playerId: number): Promise<LambdaResponse> {
    return this.request("accounts.get", { playerId });
  }

  async updatePlayer(playerId: number, updates: any): Promise<LambdaResponse> {
    return this.request("accounts.update", { playerId, ...updates });
  }

  async deletePlayer(playerId: number): Promise<LambdaResponse> {
    return this.request("accounts.delete", { playerId });
  }

  // Match methods
  async listMatches(category: "man" | "woman", phase: "group" | "elim"): Promise<LambdaResponse> {
    return this.request("matches.list", { category, phase });
  }

  async getMatch(matchId: string): Promise<LambdaResponse> {
    return this.request("matches.get", { matchId });
  }

  async updateMatchScore(
    category: "man" | "woman",
    phase: "group" | "elim",
    matchId: string,
    sets: any[]
  ): Promise<LambdaResponse> {
    return this.request("matches.updateScore", {
      category,
      phase,
      matchId,
      status: "final",
      sets,
    });
  }

  async createMatch(match: any): Promise<LambdaResponse> {
    console.log('lambdaService.createMatch - Called with:', match);
    const result = await this.request("matches.create", match);
    console.log('lambdaService.createMatch - Backend response:', result);
    return result;
  }

  async updateMatch(match: any): Promise<LambdaResponse> {
    return this.request("matches.update", match);
  }

  async deleteMatch(match: any): Promise<LambdaResponse> {
    return this.request("matches.delete", match);
  }

  // Group methods
  async listGroups(category: "man" | "woman"): Promise<LambdaResponse> {
    return this.request("groups.list", { category });
  }

  async createGroup(group: any): Promise<LambdaResponse> {
    return this.request("groups.create", group);
  }

  async updateGroup(groupId: string, updates: any): Promise<LambdaResponse> {
    return this.request("groups.update", { groupId, ...updates });
  }

  async deleteGroup(groupId: string): Promise<LambdaResponse> {
    return this.request("groups.delete", { groupId });
  }

  // Standings methods
  async getStandings(category: "man" | "woman"): Promise<LambdaResponse> {
    return this.request("standings.get", { category });
  }

  async computeStandings(category: "man" | "woman"): Promise<LambdaResponse> {
    return this.request("standings.compute", { category });
  }

  async updateStandings(category: "man" | "woman", standings: any): Promise<LambdaResponse> {
    return this.request("standings.update", { category, standings });
  }

  // Bracket methods
  async getBracket(category: "man" | "woman"): Promise<LambdaResponse> {
    return this.request("bracket.get", { category });
  }

  async updateBracket(category: "man" | "woman", bracket: any): Promise<LambdaResponse> {
    return this.request("bracket.update", { category, bracket });
  }

  // Account methods
  async listAccounts(category?: "man" | "woman"): Promise<LambdaResponse> {
    return this.request("accounts.list", category ? { category } : {});
  }

  async createAccount(account: {
    username: string;
    password?: string;
    name: string;
    surname: string;
    role: "admin" | "player";
    playerId?: number | null;
    category: "man" | "woman";
  }): Promise<LambdaResponse> {
    return this.request("accounts.create", account);
  }

  async updateAccount(username: string, updates: any): Promise<LambdaResponse> {
    return this.request("accounts.update", { username, ...updates });
  }

  async deleteAccount(username: string): Promise<LambdaResponse> {
    return this.request("accounts.delete", { username });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<LambdaResponse> {
    return this.request("accounts.changePassword", {
      currentPassword,
      newPassword,
    });
  }
}

// Create singleton instance
export const lambdaService = new LambdaService();
