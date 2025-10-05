import { lambdaService } from './lambdaService';
import type { 
  Account,
  Player, 
  Group, 
  GroupMatch, 
  EliminationMatch, 
  GroupStanding, 
  BracketData, 
  Category 
} from './types';

class DataService {
  // Players (now derived from accounts)
  async getPlayers(category: Category): Promise<Player[]> {
    try {
      const response = await lambdaService.listAccounts(category);
      console.log('Lambda response for accounts:', response);
      const accounts = response.accounts || response.users || [];
      console.log('Accounts array:', accounts);
      
      // Convert accounts to players format for backward compatibility
      const players = accounts
        .filter((account: Account) => account.role === 'player')
        .map((account: Account) => ({
          id: account.playerId.toString(),
          name: account.name,
          surname: account.surname,
          category: account.category,
        }));
      console.log('Converted players:', players);
      return players;
    } catch (error) {
      console.error(`Get players error for ${category}:`, error);
      return [];
    }
  }

  async savePlayers(category: Category, players: Player[]): Promise<boolean> {
    try {
      // Note: This method would need to be implemented in Lambda
      // For now, we'll create accounts individually
      for (const player of players) {
        await lambdaService.createAccount({
          name: player.name,
          surname: player.surname,
          category: player.category,
          username: `${player.name.toLowerCase()}.${player.surname.toLowerCase()}`,
          password: 'temp_password',
          role: 'player',
          playerId: parseInt(player.id),
        });
      }
      return true;
    } catch (error) {
      console.error(`Save players error for ${category}:`, error);
      return false;
    }
  }

  // Groups
  async getGroups(category: Category): Promise<Group[]> {
    try {
      const response = await lambdaService.listGroups(category);
      return response.groups || [];
    } catch (error) {
      console.error(`Get groups error for ${category}:`, error);
      return [];
    }
  }

  async saveGroups(category: Category, groups: Group[]): Promise<boolean> {
    try {
      // Note: This method would need to be implemented in Lambda
      // For now, we'll create groups individually
      for (const group of groups) {
        await lambdaService.createGroup({
          ...group,
          category
        });
      }
      return true;
    } catch (error) {
      console.error(`Save groups error for ${category}:`, error);
      return false;
    }
  }

  // Group Matches
  async getGroupMatches(category: Category): Promise<GroupMatch[]> {
    try {
      const response = await lambdaService.listMatches(category, 'group');
      return response.matches || [];
    } catch (error) {
      console.error(`Get group matches error for ${category}:`, error);
      return [];
    }
  }

  async saveGroupMatches(category: Category, matches: GroupMatch[]): Promise<boolean> {
    try {
      // Note: This method would need to be implemented in Lambda
      // For now, we'll create matches individually
      for (const match of matches) {
        await lambdaService.createMatch({
          ...match,
          category,
          phase: 'group'
        });
      }
      return true;
    } catch (error) {
      console.error(`Save group matches error for ${category}:`, error);
      return false;
    }
  }

  // Elimination Matches
  async getEliminationMatches(category: Category): Promise<EliminationMatch[]> {
    try {
      const response = await lambdaService.listMatches(category, 'elim');
      return response.matches || [];
    } catch (error) {
      console.error(`Get elimination matches error for ${category}:`, error);
      return [];
    }
  }

  async saveEliminationMatches(category: Category, matches: EliminationMatch[]): Promise<boolean> {
    try {
      // Note: This method would need to be implemented in Lambda
      // For now, we'll create matches individually
      for (const match of matches) {
        await lambdaService.createMatch({
          ...match,
          category,
          phase: 'elim'
        });
      }
      return true;
    } catch (error) {
      console.error(`Save elimination matches error for ${category}:`, error);
      return false;
    }
  }

  // Update a single match
  async updateMatch(match: any): Promise<boolean> {
    try {
      await lambdaService.updateMatch(match);
      return true;
    } catch (error) {
      console.error(`Update match error:`, error);
      return false;
    }
  }

  // Delete a group match
  async deleteGroupMatch(category: Category, matchId: string): Promise<boolean> {
    try {
      await lambdaService.deleteMatch({
        id: matchId,
        category,
        phase: 'group'
      });
      return true;
    } catch (error) {
      console.error(`Delete group match error for ${category}:`, error);
      return false;
    }
  }

  // Delete an elimination match
  async deleteEliminationMatch(category: Category, matchId: string): Promise<boolean> {
    try {
      await lambdaService.deleteMatch({
        id: matchId,
        category,
        phase: 'elim'
      });
      return true;
    } catch (error) {
      console.error(`Delete elimination match error for ${category}:`, error);
      return false;
    }
  }

  // Standings
  async getStandings(category: Category): Promise<GroupStanding[]> {
    try {
      const response = await lambdaService.getStandings(category);
      return response.groups || [];
    } catch (error) {
      console.error(`Get standings error for ${category}:`, error);
      return [];
    }
  }

  async saveStandings(category: Category, groups: GroupStanding[]): Promise<boolean> {
    try {
      await lambdaService.updateStandings(category, {
        groups,
        tiebreakers: ['wins', 'setDiff', 'pointDiff', 'headToHead', 'random']
      });
      return true;
    } catch (error) {
      console.error(`Save standings error for ${category}:`, error);
      return false;
    }
  }

  // Bracket
  async getBracket(category: Category): Promise<BracketData | null> {
    try {
      const response = await lambdaService.getBracket(category);
      return response.bracket || null;
    } catch (error) {
      console.error(`Get bracket error for ${category}:`, error);
      return null;
    }
  }

  async saveBracket(category: Category, bracket: BracketData): Promise<boolean> {
    try {
      bracket.updatedAt = new Date().toISOString();
      await lambdaService.updateBracket(category, bracket);
      return true;
    } catch (error) {
      console.error(`Save bracket error for ${category}:`, error);
      return false;
    }
  }

  // Helper methods
  async getPlayerById(category: Category, playerId: string): Promise<Player | null> {
    const players = await this.getPlayers(category);
    return players.find(p => p.id === playerId) || null;
  }

  async getPlayerName(category: Category, playerId: string): Promise<string> {
    const player = await this.getPlayerById(category, playerId);
    return player ? `${player.name} ${player.surname}` : 'Unknown Player';
  }

  async getMatchesForPlayer(category: Category, playerId: string): Promise<(GroupMatch | EliminationMatch)[]> {
    const [groupMatches, eliminationMatches] = await Promise.all([
      this.getGroupMatches(category),
      this.getEliminationMatches(category)
    ]);

    return [
      ...groupMatches.filter(m => m.p1 === playerId || m.p2 === playerId),
      ...eliminationMatches.filter(m => m.p1 === playerId || m.p2 === playerId)
    ];
  }

  async getTodaysMatches(category: Category): Promise<(GroupMatch | EliminationMatch)[]> {
    const [groupMatches, eliminationMatches] = await Promise.all([
      this.getGroupMatches(category),
      this.getEliminationMatches(category)
    ]);

    const today = new Date().toISOString().split('T')[0];
    
    return [
      ...groupMatches.filter(m => m.scheduledAt?.startsWith(today)),
      ...eliminationMatches.filter(m => m.scheduledAt?.startsWith(today))
    ];
  }

  // Get upcoming matches from both categories
  async getUpcomingMatches(): Promise<(GroupMatch | EliminationMatch)[]> {
    try {
      const [manGroupMatches, manElimMatches, womanGroupMatches, womanElimMatches] = await Promise.all([
        this.getGroupMatches('man'),
        this.getEliminationMatches('man'),
        this.getGroupMatches('woman'),
        this.getEliminationMatches('woman')
      ]);

      const allMatches = [
        ...manGroupMatches,
        ...manElimMatches,
        ...womanGroupMatches,
        ...womanElimMatches
      ];

      const now = new Date();
      
      return allMatches
        .filter(m => m.status === 'scheduled' && m.scheduledAt)
        .filter(m => new Date(m.scheduledAt!) > now)
        .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
    } catch (error) {
      console.error('Get upcoming matches error:', error);
      return [];
    }
  }

  async getNextMatchForPlayer(category: Category, playerId: string): Promise<(GroupMatch | EliminationMatch) | null> {
    const matches = await this.getMatchesForPlayer(category, playerId);
    const upcomingMatches = matches
      .filter(m => m.status === 'scheduled' && m.scheduledAt)
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

    return upcomingMatches[0] || null;
  }
}

export const dataService = new DataService();
