import { useEffect, useMemo, useState } from 'react';

function Profile({ currentUser, apiBase, onSaved }) {
	const [isOpen, setIsOpen] = useState(false);
	const [username, setUsername] = useState('');
	const [bio, setBio] = useState('');
	const [photoFile, setPhotoFile] = useState(null);
	const [photoPreview, setPhotoPreview] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');

	useEffect(() => {
		if (!currentUser) {
			return;
		}

		setUsername(currentUser.username || '');
		setBio(currentUser.bio || '');
		setPhotoPreview(currentUser.profile_image || '');
		setPhotoFile(null);
	}, [currentUser]);

	const actionLabel = useMemo(() => {
		return isOpen ? 'Close Profile Editor' : 'Edit Profile';
	}, [isOpen]);

	const handlePhotoChange = (event) => {
		setError('');
		const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;

		if (!file) {
			setPhotoFile(null);
			return;
		}

		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
		if (!allowedTypes.includes(file.type)) {
			setError('Please select JPG, PNG, WEBP, or GIF image.');
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			setError('Image size must be 5MB or less.');
			return;
		}

		setPhotoFile(file);

		const reader = new FileReader();
		reader.onload = () => {
			setPhotoPreview(typeof reader.result === 'string' ? reader.result : '');
		};
		reader.readAsDataURL(file);
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError('');
		setSuccess('');

		if (!currentUser) {
			setError('No active user profile. Please login again.');
			return;
		}

		if (!username.trim()) {
			setError('Username is required.');
			return;
		}

		try {
			setSaving(true);

			const formData = new FormData();
			formData.append('user_id', String(currentUser.id));
			formData.append('username', username.trim());
			formData.append('bio', bio.trim());

			if (photoFile) {
				formData.append('profile_image', photoFile);
			}

			const response = await fetch(`${apiBase}/profile.php`, {
				method: 'POST',
				body: formData,
			});

			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.message || 'Failed to save profile');
			}

			const updatedUser = result.data || {};
			setUsername(updatedUser.username || username.trim());
			setBio(updatedUser.bio || bio.trim());
			setPhotoPreview(updatedUser.profile_image || photoPreview);
			setPhotoFile(null);
			setSuccess('Profile updated successfully.');
			setIsOpen(false);

			if (typeof onSaved === 'function') {
				onSaved(updatedUser);
			}
		} catch (err) {
			setError(err.message || 'Failed to save profile');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="profile-editor-wrap">
			<button type="button" className="profile-edit-toggle" onClick={() => setIsOpen((previous) => !previous)}>
				{actionLabel}
			</button>

			{error ? <p className="error-banner profile-notice">{error}</p> : null}
			{success ? <p className="profile-success profile-notice">{success}</p> : null}

			{isOpen ? (
				<form className="profile-editor" onSubmit={handleSubmit}>
					<label htmlFor="profile-username">Username</label>
					<input
						id="profile-username"
						type="text"
						value={username}
						onChange={(event) => setUsername(event.target.value)}
						placeholder="Your display name"
					/>

					<label htmlFor="profile-bio">Bio</label>
					<textarea
						id="profile-bio"
						value={bio}
						maxLength={500}
						onChange={(event) => setBio(event.target.value)}
						placeholder="Write a short bio"
					/>

					<label htmlFor="profile-photo">Profile Photo</label>
					<input
						id="profile-photo"
						type="file"
						accept="image/jpeg,image/png,image/webp,image/gif"
						onChange={handlePhotoChange}
					/>

					{photoPreview ? (
						<div className="profile-preview">
							<img src={photoPreview} alt="Profile preview" />
						</div>
					) : null}

					<button type="submit" disabled={saving}>
						{saving ? 'Saving...' : 'Save Profile'}
					</button>
				</form>
			) : null}
		</div>
	);
}

export default Profile;
