import { useState, useEffect } from 'react';
import { userService } from '../api';
import type { Account, Category } from '../api/types';

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountUpdated: () => void;
  account: Omit<Account, 'password'>;
}

export function EditAccountModal({ isOpen, onClose, onAccountUpdated, account }: EditAccountModalProps) {
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    surname: '',
    role: 'player' as 'admin' | 'player',
    playerId: '',
    category: 'man' as Category,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize form data when account changes
  useEffect(() => {
    if (account) {
      setFormData({
        username: account.username,
        name: account.name,
        surname: account.surname,
        role: account.role,
        playerId: account.playerId?.toString() || '',
        category: account.category,
      });
    }
  }, [account]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Prepare update data
      const updateData: Partial<Account> = {
        name: formData.name,
        surname: formData.surname,
        role: formData.role,
        category: formData.category,
      };

      // Only update username if it changed
      if (formData.username !== account.username) {
        updateData.username = formData.username;
      }

      const success = await userService.updateAccount(account.username, updateData);
      
      if (success) {
        onAccountUpdated();
        onClose();
      } else {
        setError('Nie udało się zaktualizować konta');
      }
    } catch (error) {
      console.error('Update account error:', error);
      setError('Wystąpił błąd podczas aktualizacji konta');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edytuj Konto</h2>
          <button className="modal-close" onClick={handleClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="input-group">
            <label htmlFor="username" className="input-label">Nazwa użytkownika *</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              className="input-field"
              placeholder="Wprowadź nazwę użytkownika"
              required
              disabled={isLoading}
            />
          </div>

          <div className="input-group">
            <label htmlFor="name" className="input-label">Imię *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="input-field"
              placeholder="Wprowadź imię"
              required
              disabled={isLoading}
            />
          </div>

          <div className="input-group">
            <label htmlFor="surname" className="input-label">Nazwisko *</label>
            <input
              type="text"
              id="surname"
              name="surname"
              value={formData.surname}
              onChange={handleInputChange}
              className="input-field"
              placeholder="Wprowadź nazwisko"
              required
              disabled={isLoading}
            />
          </div>

          <div className="input-group">
            <label htmlFor="category" className="input-label">Kategoria *</label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className="input-field"
              required
              disabled={isLoading}
            >
              <option value="man">Mężczyźni</option>
              <option value="woman">Kobiety</option>
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="role" className="input-label">Rola *</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleInputChange}
              className="input-field"
              required
              disabled={isLoading}
            >
              <option value="player">Gracz</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="playerId" className="input-label">ID Gracza</label>
            <input
              type="number"
              id="playerId"
              name="playerId"
              value={formData.playerId}
              className="input-field"
              readOnly
              disabled
            />
            <small className="input-help">
              ID Gracza nie może być zmieniony
            </small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              onClick={handleClose}
              className="cancel-btn"
              disabled={isLoading}
            >
              Anuluj
            </button>
            <button
              type="submit"
              className="submit-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Aktualizowanie...' : 'Zaktualizuj Konto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
