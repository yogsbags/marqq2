import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Bell, X, CheckCircle, AlertTriangle, Info, TrendingUp, Users, Target, DollarSign, Clock, Trash2, Settings, AreaChart as MarkAsUnread } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'error';
  timestamp: Date;
  read: boolean;
  category: 'campaign' | 'system' | 'lead' | 'performance';
  actionUrl?: string;
}

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      title: 'Campaign Performance Alert',
      message: 'Your "Q1 Lead Generation" campaign has exceeded ROI targets by 23%',
      type: 'success',
      timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      read: false,
      category: 'campaign'
    },
    {
      id: '2',
      title: 'New High-Value Lead',
      message: 'AI scored a new lead from TechCorp Solutions with 95% match score',
      type: 'info',
      timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      read: false,
      category: 'lead'
    },
    {
      id: '3',
      title: 'Budget Optimization Complete',
      message: 'AI has optimized your campaign budget allocation, saving ₹45,000',
      type: 'success',
      timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      read: true,
      category: 'performance'
    },
    {
      id: '4',
      title: 'Voice Bot Campaign Started',
      message: 'AI Voice Bot has initiated outreach to 2,847 prospects',
      type: 'info',
      timestamp: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
      read: true,
      category: 'campaign'
    },
    {
      id: '5',
      title: 'System Maintenance Scheduled',
      message: 'Scheduled maintenance on Sunday 2 AM - 4 AM IST',
      type: 'warning',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      read: false,
      category: 'system'
    },
    {
      id: '6',
      title: 'Content Generation Complete',
      message: 'AI has generated 450 blog posts and 680 social media posts',
      type: 'success',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
      read: true,
      category: 'campaign'
    },
    {
      id: '7',
      title: 'Low Conversion Alert',
      message: 'Display ads campaign showing 15% below target conversion rate',
      type: 'warning',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
      read: false,
      category: 'performance'
    },
    {
      id: '8',
      title: 'Customer Segmentation Updated',
      message: 'AI has identified 3 new customer segments with high engagement potential',
      type: 'info',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
      read: true,
      category: 'lead'
    }
  ]);

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getCategoryIcon = (category: Notification['category']) => {
    switch (category) {
      case 'campaign':
        return <Target className="h-4 w-4" />;
      case 'lead':
        return <Users className="h-4 w-4" />;
      case 'performance':
        return <TrendingUp className="h-4 w-4" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };

  const getNotificationBadgeColor = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'warning':
        return 'bg-orange-100 text-orange-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === notificationId 
          ? { ...notification, read: true }
          : notification
      )
    );
  };

  const markAsUnread = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === notificationId 
          ? { ...notification, read: false }
          : notification
      )
    );
  };

  const deleteNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== notificationId));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notification => ({ ...notification, read: true })));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/20 z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Notifications Panel */}
      <div className="fixed top-16 right-6 w-96 h-[32rem] bg-background border rounded-lg shadow-2xl z-50 animate-in slide-in-from-top-5 fade-in-50 duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
              <Bell className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
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

        {/* Filter Tabs */}
        <div className="flex items-center justify-between p-4 border-b bg-muted/30 flex-shrink-0">
          <div className="flex space-x-2">
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
              className={cn(
                filter === 'all' 
                  ? 'bg-orange-500 text-white hover:bg-orange-600' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-900/20'
              )}
            >
              All ({notifications.length})
            </Button>
            <Button
              variant={filter === 'unread' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('unread')}
              className={cn(
                filter === 'unread' 
                  ? 'bg-orange-500 text-white hover:bg-orange-600' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-900/20'
              )}
            >
              Unread ({unreadCount})
            </Button>
          </div>
          
          <div className="flex space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              disabled={unreadCount === 0}
            >
              Mark all read
            </Button>
          </div>
        </div>

        {/* Notifications List */}
        <ScrollArea className="flex-1 max-h-96 overflow-y-auto">
          <div className="p-2">
            {filteredNotifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
                <p className="text-xs">You're all caught up!</p>
              </div>
            ) : (
              <div className="space-y-1 pb-2">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "p-3 rounded-lg border transition-all duration-200 hover:bg-muted/50 group cursor-pointer",
                      !notification.read ? "bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800" : "bg-background"
                    )}
                    onClick={() => !notification.read && markAsRead(notification.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className={cn(
                                "text-sm font-medium text-gray-900 dark:text-gray-100",
                                !notification.read && "font-semibold"
                              )}>
                                {notification.title}
                              </h4>
                              {!notification.read && (
                                <div className="w-2 h-2 bg-orange-500 rounded-full" />
                              )}
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                              {notification.message}
                            </p>
                            <div className="flex items-center space-x-3 mt-2">
                              <div className="flex items-center space-x-1">
                                {getCategoryIcon(notification.category)}
                                <span className="text-xs text-muted-foreground capitalize">
                                  {notification.category}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatTimeAgo(notification.timestamp)}
                              </span>
                            </div>
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notification.read ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => markAsRead(notification.id)}
                                className="h-6 w-6 text-gray-500 hover:text-green-600 hover:bg-green-50"
                                title="Mark as read"
                              >
                                <CheckCircle className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => markAsUnread(notification.id)}
                                className="h-6 w-6 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                title="Mark as unread"
                              >
                                <MarkAsUnread className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteNotification(notification.id)}
                              className="h-6 w-6 text-gray-500 hover:text-red-600 hover:bg-red-50"
                              title="Delete notification"
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
            )}
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="p-4 flex items-center justify-between flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllNotifications}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}