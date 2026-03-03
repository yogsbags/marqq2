import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  X,
  CheckCircle,
  AlertTriangle,
  Info,
  TrendingUp,
  Users,
  Target,
  DollarSign,
  Clock,
  Trash2,
  Settings,
  AreaChart as MarkAsUnread,
  Shield,
  Newspaper,
  Rocket,
  DollarSign as PricingIcon,
  Handshake,
  UserPlus,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface AgentNotification {
  id: string;
  agent_name: string;
  agent_role: string;
  task_type: string;
  title: string;
  summary: string;
  full_output?: Record<string, unknown>;
  action_items?: Array<{ label: string; priority: string; url?: string }>;
  status: 'success' | 'error' | 'running';
  duration_ms?: number;
  read: boolean;
  created_at: string;
}

const AGENT_COLOURS: Record<string, string> = {
  zara:  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  maya:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  riya:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  arjun: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  dev:   'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  priya: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const AGENT_INITIALS: Record<string, string> = {
  zara: 'ZA', maya: 'MA', riya: 'RI', arjun: 'AR', dev: 'DV', priya: 'PR',
};

interface CompetitorAlert {
  id: string;
  competitor_name: string;
  alert_type: 'news' | 'funding' | 'product_launch' | 'pricing_change' | 'acquisition' | 'partnership' | 'leadership_change' | 'other';
  title: string;
  summary: string;
  full_content?: string;
  source_url: string;
  source_domain?: string;
  published_at?: string;
  detected_at: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  priority: 'low' | 'medium' | 'high' | 'critical';
  read: boolean;
  dismissed: boolean;
  created_at: string;
}

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onModuleSelect?: (moduleId: string | null) => void;
}

export function NotificationsPanel({ isOpen, onClose, onModuleSelect }: NotificationsPanelProps) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<CompetitorAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [activeTab, setActiveTab] = useState<'ai-team' | 'competitors'>('ai-team');
  const [agentNotifs, setAgentNotifs] = useState<AgentNotification[]>([]);
  const [agentFilter, setAgentFilter] = useState<string>('all');

  const fetchAgentNotifications = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('agent_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setAgentNotifs(data);
  };

  const markAgentRead = async (id: string) => {
    await supabase.from('agent_notifications').update({ read: true }).eq('id', id);
    setAgentNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  // Fetch alerts from Supabase
  const fetchAlerts = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('competitor_alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      setAlerts(data || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user || !isOpen) return;

    fetchAlerts();
    fetchAgentNotifications();

    // Real-time subscription for new agent notifications
    const agentChannel = supabase
      .channel('agent-notifications-live')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          setAgentNotifs((prev) => [payload.new as AgentNotification, ...prev]);
        }
      )
      .subscribe();

    // Real-time subscription for new alerts
    const subscription = supabase
      .channel('competitor_alerts_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'competitor_alerts',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('[Real-time] New competitor alert:', payload.new);
          setAlerts((prev) => [payload.new as CompetitorAlert, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'competitor_alerts',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('[Real-time] Alert updated:', payload.new);
          setAlerts((prev) =>
            prev.map((alert) =>
              alert.id === payload.new.id ? (payload.new as CompetitorAlert) : alert
            )
          );
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(agentChannel);
    };
  }, [user, isOpen]);

  const getAlertTypeIcon = (type: CompetitorAlert['alert_type']) => {
    switch (type) {
      case 'funding':
        return <DollarSign className="h-4 w-4 text-green-500" />;
      case 'product_launch':
        return <Rocket className="h-4 w-4 text-blue-500" />;
      case 'pricing_change':
        return <PricingIcon className="h-4 w-4 text-orange-500" />;
      case 'acquisition':
        return <Handshake className="h-4 w-4 text-purple-500" />;
      case 'partnership':
        return <Handshake className="h-4 w-4 text-indigo-500" />;
      case 'leadership_change':
        return <UserPlus className="h-4 w-4 text-pink-500" />;
      case 'news':
        return <Newspaper className="h-4 w-4 text-gray-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityBadgeColor = (priority: CompetitorAlert['priority']) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
      case 'medium':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  const getSentimentIcon = (sentiment?: CompetitorAlert['sentiment']) => {
    if (!sentiment) return null;

    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'negative':
        return <AlertTriangle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return date.toLocaleDateString();
  };

  const markAsRead = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('competitor_alerts')
        .update({ read: true })
        .eq('id', alertId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setAlerts((prev) =>
        prev.map((alert) =>
          alert.id === alertId ? { ...alert, read: true } : alert
        )
      );
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const markAsUnread = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('competitor_alerts')
        .update({ read: false })
        .eq('id', alertId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setAlerts((prev) =>
        prev.map((alert) =>
          alert.id === alertId ? { ...alert, read: false } : alert
        )
      );
    } catch (error) {
      console.error('Error marking alert as unread:', error);
    }
  };

  const archiveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('competitor_alerts')
        .update({ archived: true })
        .eq('id', alertId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
    } catch (error) {
      console.error('Error archiving alert:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadAlerts = alerts.filter((a) => !a.read).map((a) => a.id);

      if (unreadAlerts.length === 0) return;

      const { error } = await supabase
        .from('competitor_alerts')
        .update({ read: true })
        .in('id', unreadAlerts)
        .eq('user_id', user?.id);

      if (error) throw error;

      setAlerts((prev) => prev.map((alert) => ({ ...alert, read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const clearAllNotifications = async () => {
    try {
      const alertIds = alerts.map((a) => a.id);

      if (alertIds.length === 0) return;

      const { error } = await supabase
        .from('competitor_alerts')
        .update({ archived: true })
        .in('id', alertIds)
        .eq('user_id', user?.id);

      if (error) throw error;

      setAlerts([]);
    } catch (error) {
      console.error('Error clearing all notifications:', error);
    }
  };

  const filteredAlerts = filter === 'unread' ? alerts.filter((a) => !a.read) : alerts;
  const filteredAgentNotifs = agentFilter === 'all'
    ? agentNotifs
    : agentNotifs.filter((n) => n.agent_name === agentFilter);

  const unreadCount = alerts.filter((a) => !a.read && !a.dismissed).length
    + agentNotifs.filter((n) => !n.read).length;

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Notifications Panel */}
      <div className="fixed top-16 right-6 w-[28rem] h-[36rem] bg-background border rounded-lg shadow-2xl z-50 animate-in slide-in-from-top-5 fade-in-50 duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
              <Bell className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Main Tabs: AI Team / Competitors */}
        <div className="flex border-b bg-muted/30 flex-shrink-0">
          <button
            onClick={() => setActiveTab('ai-team')}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              activeTab === 'ai-team'
                ? 'border-b-2 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            AI Team {agentNotifs.filter((n) => !n.read).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs">
                {agentNotifs.filter((n) => !n.read).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('competitors')}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              activeTab === 'competitors'
                ? 'border-b-2 border-orange-500 text-orange-700 dark:text-orange-300'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            Competitors {alerts.filter((a) => !a.read).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-xs">
                {alerts.filter((a) => !a.read).length}
              </span>
            )}
          </button>
        </div>

        {/* Competitors sub-filter (only shown on competitors tab) */}
        {activeTab === 'competitors' && (
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/10 flex-shrink-0">
            <div className="flex space-x-2">
              <Button variant={filter === 'all' ? 'default' : 'ghost'} size="sm"
                onClick={() => setFilter('all')}
                className={cn(filter === 'all' ? 'bg-orange-500 text-white hover:bg-orange-600' : 'text-gray-700 dark:text-gray-300')}>
                All ({alerts.length})
              </Button>
              <Button variant={filter === 'unread' ? 'default' : 'ghost'} size="sm"
                onClick={() => setFilter('unread')}
                className={cn(filter === 'unread' ? 'bg-orange-500 text-white hover:bg-orange-600' : 'text-gray-700 dark:text-gray-300')}>
                Unread ({alerts.filter((a) => !a.read).length})
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={markAllAsRead}
              className="text-xs text-gray-700 dark:text-gray-300"
              disabled={alerts.filter((a) => !a.read).length === 0}>
              Mark all read
            </Button>
          </div>
        )}

        {/* AI Team filter chips (only shown on ai-team tab) */}
        {activeTab === 'ai-team' && (
          <div className="flex gap-1 flex-wrap px-3 py-2 border-b bg-muted/10 flex-shrink-0">
            {(['all', 'zara', 'maya', 'riya', 'arjun', 'dev', 'priya'] as const).map((name) => (
              <button
                key={name}
                onClick={() => setAgentFilter(name)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium capitalize transition-colors',
                  agentFilter === name
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                )}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Notifications List */}
        <ScrollArea className="flex-1 max-h-96 overflow-y-auto">
          <div className="p-2">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50 animate-pulse" />
                <p className="text-sm">Loading notifications...</p>
              </div>
            ) : !user ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sign in to view notifications</p>
              </div>
            ) : activeTab === 'ai-team' ? (
              filteredAgentNotifs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No AI team updates yet</p>
                  <p className="text-xs">Your agents run on schedule and surface insights here</p>
                </div>
              ) : (
                <div className="space-y-2 pb-2">
                  {filteredAgentNotifs.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => !notif.read && markAgentRead(notif.id)}
                      className={cn(
                        'p-3 rounded-lg border transition-all duration-200 hover:bg-muted/50 cursor-pointer',
                        !notif.read
                          ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800'
                          : 'bg-background'
                      )}
                    >
                      <div className="flex items-start space-x-3">
                        {/* Agent avatar circle */}
                        <div
                          className={cn(
                            'flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold',
                            AGENT_COLOURS[notif.agent_name] ?? 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {AGENT_INITIALS[notif.agent_name] ?? notif.agent_name.slice(0, 2).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-semibold capitalize text-gray-900 dark:text-gray-100">
                              {notif.agent_name}
                              {notif.agent_role && (
                                <span className="ml-1 font-normal text-muted-foreground">· {notif.agent_role}</span>
                              )}
                            </span>
                            <div className="flex items-center space-x-1.5">
                              {!notif.read && (
                                <div className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatTimeAgo(notif.created_at)}
                              </span>
                            </div>
                          </div>

                          <p className={cn(
                            'text-xs text-gray-700 dark:text-gray-300 mb-1',
                            !notif.read ? 'font-semibold' : 'font-medium'
                          )}>
                            {notif.title}
                          </p>

                          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-2">
                            {notif.summary}
                          </p>

                          {/* Action item chips */}
                          {notif.action_items && notif.action_items.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {notif.action_items.slice(0, 3).map((item, i) => (
                                <span
                                  key={i}
                                  className={cn(
                                    'px-2 py-0.5 rounded-full text-xs font-medium',
                                    item.priority === 'high'
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                                      : item.priority === 'medium'
                                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'
                                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                  )}
                                >
                                  {item.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              // Competitor alerts tab
              filteredAlerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No competitor alerts</p>
                  <p className="text-xs">Configure monitoring in Company Intelligence</p>
                </div>
              ) : (
                <div className="space-y-2 pb-2">
                  {filteredAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={cn(
                        'p-3 rounded-lg border transition-all duration-200 hover:bg-muted/50 group',
                        !alert.read
                          ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800'
                          : 'bg-background'
                      )}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getAlertTypeIcon(alert.alert_type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center space-x-2 flex-1">
                              <h4
                                className={cn(
                                  'text-sm font-medium text-gray-900 dark:text-gray-100',
                                  !alert.read && 'font-semibold'
                                )}
                              >
                                {alert.competitor_name}
                              </h4>
                              {!alert.read && (
                                <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
                              )}
                              <Badge
                                className={cn('text-xs px-2 py-0', getPriorityBadgeColor(alert.priority))}
                              >
                                {alert.priority}
                              </Badge>
                            </div>
                          </div>

                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {alert.title}
                          </p>

                          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-2">
                            {alert.summary}
                          </p>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                              <span className="capitalize">{alert.alert_type.replace('_', ' ')}</span>
                              {alert.sentiment && (
                                <div className="flex items-center space-x-1">
                                  {getSentimentIcon(alert.sentiment)}
                                  <span className="capitalize">{alert.sentiment}</span>
                                </div>
                              )}
                              <span>{formatTimeAgo(alert.created_at)}</span>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a
                                href={alert.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-6 w-6 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 rounded"
                                title="View source"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              {!alert.read ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => { e.stopPropagation(); markAsRead(alert.id); }}
                                  className="h-6 w-6 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 dark:hover:text-green-300"
                                  title="Mark as read"
                                >
                                  <CheckCircle className="h-3 w-3" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => { e.stopPropagation(); markAsUnread(alert.id); }}
                                  className="h-6 w-6 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
                                  title="Mark as unread"
                                >
                                  <MarkAsUnread className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); archiveAlert(alert.id); }}
                                className="h-6 w-6 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                                title="Archive alert"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </ScrollArea>

        {/* Footer Actions — only shown on Competitors tab */}
        {activeTab === 'competitors' && alerts.length > 0 && (
          <>
            <Separator />
            <div className="p-4 flex items-center justify-between flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllNotifications}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onModuleSelect?.('company-intelligence');
                  onClose();
                }}
                className="text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
