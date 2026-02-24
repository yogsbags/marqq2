import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Moon, Sun, User, Bell, Shield, Database, Bot } from 'lucide-react';

type IntegrationConnector = {
  id: string;
  name: string;
  status: 'available' | 'configured' | 'not_configured';
  notes?: string;
  connected?: boolean;
  connectedAt?: string | null;
};

export function SettingsPanel() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<IntegrationConnector[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationActionId, setIntegrationActionId] = useState<string | null>(null);

  // AI Team Context form
  const [agentCtx, setAgentCtx] = useState({
    company: '', industry: '', icp: '', competitors: '', campaigns: '', keywords: '', goals: '',
  });
  const [ctxSaving, setCtxSaving] = useState(false);

  const saveAgentContext = async () => {
    if (!user?.id) { toast.error('Sign in to save agent context'); return; }
    if (!agentCtx.company.trim()) { toast.error('Company name is required'); return; }
    setCtxSaving(true);
    try {
      const res = await fetch('/api/agents/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, ...agentCtx }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'save failed');
      }
      toast.success('AI team context saved — all agents will use this on their next run');
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setCtxSaving(false);
    }
  };

  const loadIntegrations = useCallback(async () => {
    if (!user?.id) {
      setIntegrations([]);
      return;
    }
    setIntegrationsLoading(true);
    try {
      const resp = await fetch(`/api/integrations?userId=${encodeURIComponent(user.id)}`);
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error || json?.details || 'request failed');
      setIntegrations(Array.isArray(json?.connectors) ? json.connectors : []);
    } catch (error: any) {
      toast.error(`Failed to load integrations: ${error?.message || 'unknown error'}`);
      setIntegrations([]);
    } finally {
      setIntegrationsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  async function connectIntegration(connectorId: string) {
    if (!user?.id) return;
    setIntegrationActionId(connectorId);
    try {
      const resp = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          connectorId,
          authType: 'oauth'
        })
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error || json?.details || 'connect failed');
      await loadIntegrations();
      toast.success('Integration connected');
    } catch (error: any) {
      toast.error(`Connect failed: ${error?.message || 'unknown error'}`);
    } finally {
      setIntegrationActionId(null);
    }
  }

  async function disconnectIntegration(connectorId: string) {
    if (!user?.id) return;
    setIntegrationActionId(connectorId);
    try {
      const resp = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          connectorId
        })
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error || json?.details || 'disconnect failed');
      await loadIntegrations();
      toast.success('Integration disconnected');
    } catch (error: any) {
      toast.error(`Disconnect failed: ${error?.message || 'unknown error'}`);
    } finally {
      setIntegrationActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and platform preferences
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Profile Settings</span>
            </CardTitle>
            <CardDescription>
              Update your personal information and preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" defaultValue={user?.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue={user?.email} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="role">Role</Label>
              <Badge variant="secondary">{user?.role}</Badge>
            </div>
            <Button className="w-full">Update Profile</Button>
          </CardContent>
        </Card>

        {/* Theme Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {theme === 'light' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              <span>Appearance</span>
            </CardTitle>
            <CardDescription>
              Customize the look and feel of your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="theme">Dark Mode</Label>
              <Switch
                id="theme"
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Theme Preview</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 border rounded-lg bg-background">
                  <div className="h-2 bg-primary rounded mb-2"></div>
                  <div className="h-1 bg-muted rounded mb-1"></div>
                  <div className="h-1 bg-muted rounded w-2/3"></div>
                </div>
                <div className="p-3 border rounded-lg bg-card">
                  <div className="h-2 bg-orange-500 rounded mb-2"></div>
                  <div className="h-1 bg-muted rounded mb-1"></div>
                  <div className="h-1 bg-muted rounded w-3/4"></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Notifications</span>
            </CardTitle>
            <CardDescription>
              Configure how you receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="email-notifications">Email Notifications</Label>
              <Switch id="email-notifications" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="push-notifications">Push Notifications</Label>
              <Switch id="push-notifications" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="marketing-emails">Marketing Emails</Label>
              <Switch id="marketing-emails" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="weekly-reports">Weekly Reports</Label>
              <Switch id="weekly-reports" defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Security</span>
            </CardTitle>
            <CardDescription>
              Manage your account security and privacy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full">
              Change Password
            </Button>
            <Button variant="outline" className="w-full">
              Enable Two-Factor Authentication
            </Button>
            <div className="flex items-center justify-between">
              <Label htmlFor="session-timeout">Auto Logout</Label>
              <Switch id="session-timeout" defaultChecked />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Active Sessions</Label>
              <div className="text-sm text-muted-foreground">
                You are currently signed in on 1 device
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connect ad, analytics, and commerce data sources for deterministic planning and forecasting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!user?.id ? (
            <div className="text-sm text-muted-foreground">Sign in to manage integrations.</div>
          ) : integrationsLoading ? (
            <div className="text-sm text-muted-foreground">Loading integrations...</div>
          ) : integrations.length ? (
            integrations.map((connector) => (
              <div key={connector.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{connector.name}</div>
                  {connector.notes ? <div className="text-xs text-muted-foreground mt-1">{connector.notes}</div> : null}
                  {connector.connectedAt ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Connected: {new Date(connector.connectedAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={connector.connected ? 'default' : 'secondary'}>
                    {connector.connected ? 'Connected' : 'Not connected'}
                  </Badge>
                  {connector.connected ? (
                    <Button
                      variant="outline"
                      disabled={integrationActionId === connector.id}
                      onClick={() => disconnectIntegration(connector.id)}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      disabled={integrationActionId === connector.id}
                      onClick={() => connectIntegration(connector.id)}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">No integrations available.</div>
          )}
        </CardContent>
      </Card>

      {/* AI Team Context */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-indigo-500" />
            <span>AI Team Context</span>
          </CardTitle>
          <CardDescription>
            Give your 6 autonomous agents (Zara, Maya, Riya, Arjun, Dev, Priya) business context.
            They read this before every scheduled run — the more detail, the better their output.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ctx-company">Company name *</Label>
              <Input
                id="ctx-company"
                placeholder="e.g. PL Capital"
                value={agentCtx.company}
                onChange={(e) => setAgentCtx((p) => ({ ...p, company: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ctx-industry">Industry / niche</Label>
              <Input
                id="ctx-industry"
                placeholder="e.g. WealthTech, India"
                value={agentCtx.industry}
                onChange={(e) => setAgentCtx((p) => ({ ...p, industry: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ctx-icp">Target ICP (ideal customer profile)</Label>
            <Input
              id="ctx-icp"
              placeholder="e.g. HNI investors, 35–55, Tier 1 cities, ₹10L+ portfolio"
              value={agentCtx.icp}
              onChange={(e) => setAgentCtx((p) => ({ ...p, icp: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ctx-competitors">Top competitors (comma-separated)</Label>
            <Input
              id="ctx-competitors"
              placeholder="e.g. Groww, Zerodha, ETMoney, PaytmMoney"
              value={agentCtx.competitors}
              onChange={(e) => setAgentCtx((p) => ({ ...p, competitors: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ctx-campaigns">Current active campaigns</Label>
            <Input
              id="ctx-campaigns"
              placeholder="e.g. SIP awareness (Google), HNI retargeting (LinkedIn)"
              value={agentCtx.campaigns}
              onChange={(e) => setAgentCtx((p) => ({ ...p, campaigns: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ctx-keywords">Active SEO keywords (comma-separated)</Label>
            <Input
              id="ctx-keywords"
              placeholder="e.g. best mutual fund app India, SIP calculator, index fund"
              value={agentCtx.keywords}
              onChange={(e) => setAgentCtx((p) => ({ ...p, keywords: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ctx-goals">Key goals this quarter</Label>
            <Textarea
              id="ctx-goals"
              placeholder="e.g. Grow organic traffic 40%, launch HNI advisory product, reduce CAC by 20%"
              rows={3}
              value={agentCtx.goals}
              onChange={(e) => setAgentCtx((p) => ({ ...p, goals: e.target.value }))}
            />
          </div>

          <Button
            onClick={saveAgentContext}
            disabled={ctxSaving || !agentCtx.company.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {ctxSaving ? 'Saving…' : 'Save AI Team Context'}
          </Button>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>Data Management</span>
          </CardTitle>
          <CardDescription>
            Manage your data and privacy settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline">Export Data</Button>
            <Button variant="outline">Download Reports</Button>
            <Button variant="destructive">Delete Account</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
