# Emergency Recovery Instructions

## If a File is Accidentally Deleted or Cleared

**DO NOT PANIC PULL FROM GIT**

If a file is accidentally cleared or deleted:

1. **Check Editor History First**
   - Use editor's undo (Ctrl+Z / Cmd+Z)
   - Check editor's local history/backup feature
   - Many editors keep unsaved changes in memory

2. **Check for Autosave/Backup Files**
   - Look for `.bak` files or editor-specific backup folders
   - Check if editor has a "Local History" feature

3. **Only Use Git as Last Resort**
   - `git checkout` restores to last committed version
   - This will lose any uncommitted work
   - Only use if editor recovery fails

4. **Prevention**
   - Always commit work before major operations
   - Use editor's auto-save features
   - Consider staging changes before risky operations

## Best Practices

- **Before risky operations**: Check git status, commit or stash changes
- **If file is cleared**: Try editor recovery first, git is last resort
- **Always verify**: Check file contents before proceeding with operations

