-- Existing limited staff accounts become members; full operator rights are assigned explicitly.
UPDATE gym_members SET role='member' WHERE role='coach';
