import { useState, useEffect } from 'react';
import { userService } from '../api';
import type { Account } from '../api/types';
import { AddPlayerModal } from './AddPlayerModal';
import { EditAccountModal } from './EditAccountModal';

export function AccountManagement() {
  const [accounts, setAccounts] = useState<Omit<Account, 'password'>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Omit<Account, 'password'> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; account: Omit<Account, 'password'> | null }>({
    show: false,
    account: null
  });

  // Load accounts on component mount
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setIsLoading(true);
      setError('');
      const accountsData = await userService.getAllAccounts();
      setAccounts(accountsData);
    } catch (error) {
      console.error('Load accounts error:', error);
      setError('Nie udało się załadować kont');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async (account: Omit<Account, 'password'>) => {
    try {
      const success = await userService.deleteAccount(account.username);
      if (success) {
        setAccounts(prev => prev.filter(acc => acc.username !== account.username));
        setDeleteConfirm({ show: false, account: null });
      } else {
        setError('Nie udało się usunąć konta');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      setError('Wystąpił błąd podczas usuwania konta');
    }
  };

  const handleEditAccount = (account: Omit<Account, 'password'>) => {
    setSelectedAccount(account);
    setShowEditModal(true);
  };

  const handleAccountUpdated = () => {
    loadAccounts(); // Reload accounts after update
    setShowEditModal(false);
    setSelectedAccount(null);
  };

  const handlePlayerAdded = () => {
    loadAccounts(); // Reload accounts after adding player
  };

  const confirmDelete = (account: Omit<Account, 'password'>) => {
    setDeleteConfirm({ show: true, account });
  };

  const cancelDelete = () => {
    setDeleteConfirm({ show: false, account: null });
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="loading">Ładowanie kont...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Zarządzanie Kontami</h1>
        <button
          className="primary-btn"
          onClick={() => setShowAddPlayerModal(true)}
        >
          Dodaj Nowego Gracza
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError('')} className="error-close">×</button>
        </div>
      )}

      <div className="accounts-table-container">
        <table className="accounts-table">
          <thead>
            <tr>
              <th>Nazwa użytkownika</th>
              <th>Rola</th>
              <th>ID Gracza</th>
              <th>Imię</th>
              <th>Kategoria</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-data">
                  Nie znaleziono kont
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.username}>
                  <td>{account.username}</td>
                  <td>
                    <span className={`role-badge ${account.role}`}>
                      {account.role}
                    </span>
                  </td>
                  <td>{account.playerId || 'N/A'}</td>
                  <td>{account.name} {account.surname}</td>
                  <td>
                    <span className={`category-badge ${account.category}`}>
                      {account.category === 'man' ? 'Mężczyźni' : 'Kobiety'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="edit-btn"
                        onClick={() => handleEditAccount(account)}
                        title="Edytuj konto"
                      >
                        ✏️
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => confirmDelete(account)}
                        title="Usuń konto"
                        disabled={account.role === 'admin'}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Player Modal */}
      <AddPlayerModal
        isOpen={showAddPlayerModal}
        onClose={() => setShowAddPlayerModal(false)}
        onPlayerAdded={handlePlayerAdded}
      />

      {/* Edit Account Modal */}
      {selectedAccount && (
        <EditAccountModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedAccount(null);
          }}
          onAccountUpdated={handleAccountUpdated}
          account={selectedAccount}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && deleteConfirm.account && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Potwierdź Usunięcie</h2>
              <button className="modal-close" onClick={cancelDelete}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                Czy na pewno chcesz usunąć konto dla{' '}
                <strong>{deleteConfirm.account.username}</strong>?
              </p>
              <p className="warning-text">
                Ta akcja nie może być cofnięta.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={cancelDelete}
                className="cancel-btn"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => handleDeleteAccount(deleteConfirm.account!)}
                className="delete-btn"
              >
                Usuń Konto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
