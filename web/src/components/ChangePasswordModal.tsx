import { useState } from 'react';
import { userService } from '../api';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Validation
    if (!formData.currentPassword) {
      setError('Obecne hasło jest wymagane');
      setIsLoading(false);
      return;
    }

    if (!formData.newPassword) {
      setError('Nowe hasło jest wymagane');
      setIsLoading(false);
      return;
    }

    if (formData.newPassword.length < 3) {
      setError('Nowe hasło musi mieć co najmniej 3 znaki');
      setIsLoading(false);
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('Nowe hasła nie są zgodne');
      setIsLoading(false);
      return;
    }

    if (formData.currentPassword === formData.newPassword) {
      setError('Nowe hasło musi być inne niż obecne hasło');
      setIsLoading(false);
      return;
    }

    try {
      const result = await userService.changePassword(
        formData.currentPassword,
        formData.newPassword
      );

      if (result.success) {
        // Reset form and close modal
        setFormData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
        onClose();
        // Optionally show success message
        alert('Hasło zostało zmienione pomyślnie');
      } else {
        setError(result.error || 'Nie udało się zmienić hasła');
      }
    } catch (error) {
      console.error('Change password error:', error);
      setError('Wystąpił błąd podczas zmiany hasła');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Zmień Hasło</h2>
          <button className="modal-close" onClick={handleClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="input-group">
            <label htmlFor="currentPassword" className="input-label">Obecne Hasło *</label>
            <input
              type="password"
              id="currentPassword"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleInputChange}
              className="input-field"
              placeholder="Wprowadź obecne hasło"
              required
              disabled={isLoading}
            />
          </div>

          <div className="input-group">
            <label htmlFor="newPassword" className="input-label">Nowe Hasło *</label>
            <input
              type="password"
              id="newPassword"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleInputChange}
              className="input-field"
              placeholder="Wprowadź nowe hasło"
              required
              disabled={isLoading}
              minLength={3}
            />
            <small className="input-help">
              Hasło musi mieć co najmniej 3 znaki
            </small>
          </div>

          <div className="input-group">
            <label htmlFor="confirmPassword" className="input-label">Potwierdź Nowe Hasło *</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              className="input-field"
              placeholder="Wprowadź nowe hasło ponownie"
              required
              disabled={isLoading}
              minLength={3}
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
              {isLoading ? 'Zmienianie...' : 'Zmień Hasło'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

