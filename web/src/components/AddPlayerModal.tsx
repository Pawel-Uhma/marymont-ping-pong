import { useState } from 'react';
import { dataService, userService } from '../api';
import type { Category } from '../api/types';

interface AddPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayerAdded: () => void;
  category?: Category; // Make category optional since we'll have a selector
}

export function AddPlayerModal({ isOpen, onClose, onPlayerAdded, category: initialCategory }: AddPlayerModalProps) {
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    surname: '',
    category: initialCategory || 'man' as Category,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
      // Get existing players and accounts
      const [existingPlayers, existingAccounts] = await Promise.all([
        dataService.getPlayers(formData.category),
        userService.getAllAccounts()
      ]);
      
      // Check if username already exists
      const usernameExists = existingAccounts.some(
        account => account.username === formData.username
      );

      if (usernameExists) {
        setError('Nazwa użytkownika już istnieje');
        setIsLoading(false);
        return;
      }

      // Check if player already exists
      const playerExists = existingPlayers.some(
        p => p.name.toLowerCase() === formData.name.toLowerCase() && 
             p.surname.toLowerCase() === formData.surname.toLowerCase()
      );

      if (playerExists) {
        setError('Gracz o tym imieniu już istnieje');
        setIsLoading(false);
        return;
      }
      
      // Create account directly (now includes player information)
      // Password will default to 'marymont' on backend if not provided
      // Player ID will be auto-generated on the backend
      const accountSuccess = await userService.createAccount({
        username: formData.username.trim(),
        password: '', // Empty password - backend will set default to 'marymont'
        name: formData.name.trim(),
        surname: formData.surname.trim(),
        role: 'player',
        playerId: null, // Backend will auto-generate
        category: formData.category,
      });

      if (!accountSuccess) {
        setError('Nie udało się utworzyć konta');
        setIsLoading(false);
        return;
      }
      
      // Reset form and close modal
      setFormData({ username: '', name: '', surname: '', category: initialCategory || 'man' as Category });
      onPlayerAdded();
      onClose();
    } catch (error) {
      console.error('Add player error:', error);
      setError('Wystąpił błąd podczas dodawania gracza');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setFormData({ username: '', name: '', surname: '', category: initialCategory || 'man' as Category });
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Dodaj Nowego Gracza</h2>
          <button className="modal-close" onClick={handleClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
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
              {isLoading ? 'Dodawanie...' : 'Dodaj Gracza'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
