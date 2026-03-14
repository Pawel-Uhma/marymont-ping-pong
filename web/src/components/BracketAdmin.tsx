import { useState, useEffect } from 'react';
import { dataService } from '../api';
import type { Player, EliminationMatch, Category, BracketType } from '../api/types';
import { BracketView } from './BracketView';

interface BracketAdminProps {
  isOpen: boolean;
  onClose: () => void;
  onBracketChanged: () => void;
  players: Player[];
  onMatchClick: (match: EliminationMatch) => void;
}

type TabKey = 'man_main' | 'woman_main' | 'man_tds';

interface BracketTab {
  key: TabKey;
  label: string;
  category: Category;
  bracketType: BracketType;
  slotCount: number;
}

const TABS: BracketTab[] = [
  { key: 'man_main', label: 'Mężczyźni', category: 'man', bracketType: 'main', slotCount: 8 },
  { key: 'woman_main', label: 'Kobiety', category: 'woman', bracketType: 'main', slotCount: 4 },
  { key: 'man_tds', label: 'Turniej Drugiej Szansy', category: 'man', bracketType: 'tds', slotCount: 8 },
];

export function BracketAdmin({ isOpen, onClose, onBracketChanged, players, onMatchClick }: BracketAdminProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('man_main');
  const [bracketData, setBracketData] = useState<Record<TabKey, { bracket: any; matches: EliminationMatch[] } | null>>({
    man_main: null,
    woman_main: null,
    man_tds: null,
  });
  const [slotSelections, setSlotSelections] = useState<Record<TabKey, string[]>>({
    man_main: Array(8).fill(''),
    woman_main: Array(4).fill(''),
    man_tds: Array(8).fill(''),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState<TabKey | null>(null);

  const loadAllBrackets = async () => {
    const results: Record<string, { bracket: any; matches: EliminationMatch[] } | null> = {};
    for (const tab of TABS) {
      results[tab.key] = await dataService.getBracketWithMatches(tab.category, tab.bracketType);
    }
    setBracketData(results as any);
  };

  useEffect(() => {
    if (isOpen) {
      loadAllBrackets();
    }
  }, [isOpen]);

  const currentTab = TABS.find(t => t.key === activeTab)!;
  const currentBracket = bracketData[activeTab];
  const hasBracket = currentBracket?.bracket != null;

  const getAvailablePlayers = (): Player[] => {
    const cat = currentTab.category;
    return players.filter(p => p.category === cat);
  };

  const handleSlotChange = (index: number, playerId: string) => {
    setSlotSelections(prev => {
      const newSelections = { ...prev };
      const arr = [...newSelections[activeTab]];
      arr[index] = playerId;
      newSelections[activeTab] = arr;
      return newSelections;
    });
    setError('');
  };

  const handleCreate = async () => {
    const selections = slotSelections[activeTab].slice(0, currentTab.slotCount);

    // Validate all slots filled
    if (selections.some(s => !s)) {
      setError('Wszystkie pozycje muszą być wypełnione');
      return;
    }

    // Validate no duplicates
    const unique = new Set(selections);
    if (unique.size !== selections.length) {
      setError('Każdy gracz może być wybrany tylko raz');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const slots = selections.map((playerId, i) => ({ position: i + 1, playerId }));
      const success = await dataService.createBracket(currentTab.category, currentTab.bracketType, slots);
      if (success) {
        await loadAllBrackets();
        onBracketChanged();
      } else {
        setError('Nie udało się utworzyć drabinki');
      }
    } catch (err) {
      setError('Wystąpił błąd podczas tworzenia drabinki');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (confirmReset !== activeTab) {
      setConfirmReset(activeTab);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const success = await dataService.resetBracket(currentTab.category, currentTab.bracketType);
      if (success) {
        setConfirmReset(null);
        await loadAllBrackets();
        onBracketChanged();
      } else {
        setError('Nie udało się zresetować drabinki');
      }
    } catch (err) {
      setError('Wystąpił błąd podczas resetowania drabinki');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const available = getAvailablePlayers();
  const matchCount = currentTab.slotCount / 2;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bracket-admin-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Zarządzanie Drabinkami</h2>
          <button className="modal-close" onClick={onClose} disabled={isLoading}>×</button>
        </div>

        <div className="modal-body">
          {/* Tabs */}
          <div className="bracket-tabs">
            {TABS.map(tab => (
              <button
                key={tab.key}
                className={`bracket-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.key); setError(''); setConfirmReset(null); }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="error-message">
              {error}
              <button onClick={() => setError('')} className="error-close">×</button>
            </div>
          )}

          {hasBracket ? (
            /* Bracket exists: show view + reset */
            <div className="bracket-admin-view">
              <BracketView
                bracket={currentBracket!.bracket}
                matches={currentBracket!.matches}
                players={players}
                title={currentTab.label}
                isAdmin={true}
                onMatchClick={onMatchClick}
              />
              <div className="bracket-admin-actions">
                {confirmReset === activeTab ? (
                  <div className="bracket-reset-confirm">
                    <span>Na pewno chcesz zresetować drabinkę? Wszystkie mecze zostaną usunięte.</span>
                    <button className="danger-btn" onClick={handleReset} disabled={isLoading}>
                      {isLoading ? 'Resetowanie...' : 'Tak, resetuj'}
                    </button>
                    <button className="secondary-btn" onClick={() => setConfirmReset(null)} disabled={isLoading}>
                      Anuluj
                    </button>
                  </div>
                ) : (
                  <button className="danger-btn" onClick={handleReset} disabled={isLoading}>
                    Resetuj drabinkę
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* No bracket: show setup form */
            <div className="bracket-setup">
              <h3>Ustawienia drabinki — {currentTab.label}</h3>
              <p className="bracket-setup-info">
                {currentTab.slotCount === 8 ? 'Ćwierćfinały (8 graczy)' : 'Półfinały (4 graczy)'}
              </p>
              <div className="bracket-setup-matches">
                {Array.from({ length: matchCount }, (_, matchIdx) => (
                  <div key={matchIdx} className="bracket-setup-match">
                    <div className="bracket-setup-match-label">Mecz {matchIdx + 1}</div>
                    <div className="bracket-setup-players">
                      <select
                        value={slotSelections[activeTab][matchIdx * 2]}
                        onChange={e => handleSlotChange(matchIdx * 2, e.target.value)}
                        className="input-field"
                        disabled={isLoading}
                      >
                        <option value="">Wybierz gracza...</option>
                        {available.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.surname}
                          </option>
                        ))}
                      </select>
                      <span className="vs-label">vs</span>
                      <select
                        value={slotSelections[activeTab][matchIdx * 2 + 1]}
                        onChange={e => handleSlotChange(matchIdx * 2 + 1, e.target.value)}
                        className="input-field"
                        disabled={isLoading}
                      >
                        <option value="">Wybierz gracza...</option>
                        {available.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.surname}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <button className="primary-btn" onClick={handleCreate} disabled={isLoading}>
                {isLoading ? 'Tworzenie...' : 'Utwórz drabinkę'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
