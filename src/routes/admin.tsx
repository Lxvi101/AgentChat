import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { authClient } from '~/lib/auth-client';
import { useState, useEffect } from 'react';
import { Trash, KeyRound, ShieldAlert, Lock, Unlock, UserPlus, ArrowLeft, Loader2, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

export const Route = createFileRoute('/admin')({
  component: AdminPage,
});

function AdminPage() {
  const profile = useQuery(api.users.getProfile);
  const bootstrap = useMutation(api.admin.bootstrapAdmin);
  const settings = useQuery(api.admin.getSettings);
  const users = useQuery(api.admin.getAllUsers);
  const toggleLock = useMutation(api.admin.toggleSignupLock);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<string | null>(null);
  const [newPassInput, setNewPassInput] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(0);
  const USERS_PAGE_SIZE = 10;

  const filteredUsers = (users ?? []).filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const pagedUsers = filteredUsers.slice(userPage * USERS_PAGE_SIZE, (userPage + 1) * USERS_PAGE_SIZE);

  // Automatically attempt to bootstrap admin on load
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Reset page when search changes
  useEffect(() => {
    setUserPage(0);
  }, [userSearch]);

  // Clamp page if filtered results shrink
  useEffect(() => {
    if (userPage > totalUserPages - 1) {
      setUserPage(Math.max(0, totalUserPages - 1));
    }
  }, [userPage, totalUserPages]);

  if (profile === undefined) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary size-8" /></div>;
  }

  if (profile?.role !== "admin") {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-chat-background">
        <ShieldAlert size={64} className="text-destructive opacity-80" />
        <h1 className="text-3xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground max-w-md text-center">You must have administrative privileges to view this page. Return to your chat dashboard.</p>
        <Link to="/chat" className="mt-4 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">
          Return to Chat
        </Link>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await authClient.admin.createUser({
        email: newEmail,
        password: newPassword,
        name: newName,
        role: "user"
      });
      setNewEmail("");
      setNewName("");
      setNewPassword("");
    } catch (err: any) {
      alert(err?.message || "Failed to create user. Check console.");
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (authId: string) => {
    if (!confirm("Are you sure you want to completely delete this user? All their data and chat history will be erased. This cannot be undone.")) return;
    try {
      // Removing the user from Better Auth triggers the Convex onDelete syncing hook!
      await authClient.admin.removeUser({ userId: authId });
    } catch (err: any) {
      alert(err?.message || "Failed to delete user.");
      console.error(err);
    }
  };

  const handleResetPassword = async (authId: string) => {
    if (!newPassInput) return;
    try {
      await authClient.admin.setUserPassword({
        userId: authId,
        newPassword: newPassInput
      });
      setResetPasswordUser(null);
      setNewPassInput("");
      alert("Password successfully updated.");
    } catch (err: any) {
      alert(err?.message || "Failed to update password.");
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-chat-background p-6 md:p-12 text-foreground overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/chat" className="p-2.5 bg-card border border-border shadow-sm hover:bg-muted/50 rounded-xl text-muted-foreground transition-all">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-color-heading tracking-tight">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">Manage global settings, user accounts, and security.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={settings?.signupsLocked ? "destructive" : "default"}
              onClick={() => toggleLock({ locked: !settings?.signupsLocked })}
              className="gap-2 h-11 px-6 shadow-md transition-all active:scale-95"
            >
              {settings?.signupsLocked ? <Lock size={16} /> : <Unlock size={16} />}
              {settings?.signupsLocked ? "Signups Locked" : "Signups Open"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* Create User Form */}
          <div className="col-span-1 rounded-2xl border border-border bg-card p-6 shadow-lg shadow-black/5">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <UserPlus size={18} />
              </div>
              Add New User
            </h2>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Name</label>
                <Input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Doe" className="bg-input/50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Email Address</label>
                <Input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jane@example.com" className="bg-input/50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Initial Password</label>
                <Input type="text" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Secure password" className="bg-input/50" />
              </div>
              <Button type="submit" disabled={creating} className="w-full mt-2 h-10 font-bold">
                {creating ? <Loader2 className="animate-spin size-4" /> : "Create Account"}
              </Button>
            </form>
          </div>

          {/* User List */}
          <div className="col-span-1 lg:col-span-2 rounded-2xl border border-border bg-card shadow-lg shadow-black/5 overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center gap-3">
              <h2 className="text-lg font-bold text-foreground shrink-0">User Directory</h2>
              <div className="relative flex-1 max-w-xs ml-auto">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-8 rounded-lg bg-background/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors"
                />
                {userSearch && (
                  <button
                    onClick={() => setUserSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto max-h-[600px] p-0 custom-scrollbar">
              {users === undefined ? (
                <div className="py-24 text-center text-muted-foreground"><Loader2 className="animate-spin size-8 mx-auto" /></div>
              ) : pagedUsers.length === 0 ? (
                <div className="py-24 text-center text-muted-foreground font-medium">
                  {userSearch ? `No users matching "${userSearch}".` : "No users found."}
                </div>
              ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-muted/40 text-muted-foreground sticky top-0 backdrop-blur-md">
                    <tr>
                      <th className="px-6 py-3.5 font-semibold text-xs uppercase tracking-wider">User Details</th>
                      <th className="px-6 py-3.5 font-semibold text-xs uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {pagedUsers.map((u) => (
                      <tr key={u._id} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-gradient-to-tr from-primary/80 to-primary flex items-center justify-center text-xs font-bold text-primary-foreground shadow-sm">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground text-sm">{u.name}</div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${u.role === 'admin' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-secondary text-secondary-foreground border border-border'}`}>
                            {u.role || 'user'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {resetPasswordUser === u.authId ? (
                            <div className="inline-flex items-center justify-end gap-2 w-full animate-in fade-in slide-in-from-right-4">
                              <Input
                                type="text"
                                placeholder="Type new password"
                                className="h-8 w-40 text-xs bg-background shadow-inner"
                                value={newPassInput}
                                onChange={(e) => setNewPassInput(e.target.value)}
                                autoFocus
                              />
                              <Button size="sm" className="h-8" onClick={() => handleResetPassword(u.authId)}>Save</Button>
                              <Button size="sm" variant="outline" className="h-8" onClick={() => { setResetPasswordUser(null); setNewPassInput(""); }}>Cancel</Button>
                            </div>
                          ) : (
                            <div className="space-x-1 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 shadow-xs"
                                onClick={() => setResetPasswordUser(u.authId)}
                                title="Reset Password"
                              >
                                <KeyRound size={14} className="mr-1.5 text-muted-foreground" />
                                Reset
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 px-2 shadow-xs"
                                onClick={() => handleDeleteUser(u.authId)}
                                title="Delete User"
                                disabled={u.authId === profile.authId}
                              >
                                <Trash size={14} />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {filteredUsers.length > USERS_PAGE_SIZE && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/10">
                <span className="text-xs text-muted-foreground">
                  Showing {userPage * USERS_PAGE_SIZE + 1}–{Math.min((userPage + 1) * USERS_PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={userPage === 0}
                    onClick={() => setUserPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2 tabular-nums">
                    {userPage + 1} / {totalUserPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={userPage >= totalUserPages - 1}
                    onClick={() => setUserPage((p) => Math.min(totalUserPages - 1, p + 1))}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
