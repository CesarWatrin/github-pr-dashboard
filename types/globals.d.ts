// What the page uses of the browser that the DOM types of TypeScript lack: the password manager of Chrome, which
// offers to save the password of the lock screen.
declare class PasswordCredential extends Credential {
  constructor(data: { id: string; password: string })
}
