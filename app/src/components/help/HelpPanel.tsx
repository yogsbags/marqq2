import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@/lib/brand';
import { 
  BookOpen, 
  MessageCircle, 
  Mail, 
  Phone, 
  ExternalLink,
  Search,
  Video,
  FileText,
  Users
} from 'lucide-react';

export function HelpPanel() {
  const helpCategories = [
    {
      title: 'Getting Started',
      icon: BookOpen,
      articles: [
        'Platform Overview',
        'Setting up your first campaign',
        'Understanding the dashboard',
        'User roles and permissions'
      ]
    },
    {
      title: 'Lead Intelligence',
      icon: Users,
      articles: [
        'Lead scoring algorithms',
        'Data enrichment process',
        'Integration setup',
        'Best practices'
      ]
    },
    {
      title: 'AI Voice Bot',
      icon: MessageCircle,
      articles: [
        'Bot configuration',
        'Conversation flows',
        'Training your bot',
        'Analytics and reporting'
      ]
    },
    {
      title: 'Troubleshooting',
      icon: FileText,
      articles: [
        'Common issues',
        'Error codes',
        'Performance optimization',
        'Data sync problems'
      ]
    }
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <Card className="rounded-[30px] border border-border/70 bg-gradient-to-br from-orange-500/[0.08] via-background to-amber-500/[0.05] shadow-sm dark:from-orange-500/[0.14] dark:via-background dark:to-amber-500/[0.08]">
        <CardContent className="space-y-3 p-5 md:p-6">
          <div className="inline-flex w-fit items-center rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">
            Help center
          </div>
          <div className="space-y-2">
            <h1 className="font-brand-syne text-3xl tracking-tight text-foreground md:text-4xl">Help &amp; Support</h1>
            <p className="max-w-[62ch] text-sm leading-6 text-muted-foreground">
              Find answers, get support, and learn how to make the most of {BRAND.name}.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search help articles, guides, and documentation..."
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Get help quickly with these common actions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              <Video className="mr-2 h-4 w-4" />
              Watch Tutorial Videos
              <ExternalLink className="ml-auto h-4 w-4" />
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <BookOpen className="mr-2 h-4 w-4" />
              View Documentation
              <ExternalLink className="ml-auto h-4 w-4" />
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <MessageCircle className="mr-2 h-4 w-4" />
              Join Community Forum
              <ExternalLink className="ml-auto h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Contact Support */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Support</CardTitle>
            <CardDescription>
              Need personalized help? Reach out to our support team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center space-x-3 p-3 border rounded-lg">
              <Mail className="h-5 w-5 text-orange-500" />
                <div>
                  <div className="font-medium">Email Support</div>
                <div className="text-sm text-muted-foreground">{BRAND.supportEmail}</div>
                </div>
              </div>
            <div className="flex items-center space-x-3 p-3 border rounded-lg">
              <Phone className="h-5 w-5 text-orange-500" />
              <div>
                <div className="font-medium">Phone Support</div>
                <div className="text-sm text-muted-foreground">+1 (555) 123-4567</div>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 border rounded-lg">
              <MessageCircle className="h-5 w-5 text-orange-500" />
              <div>
                <div className="font-medium">Live Chat</div>
                <div className="text-sm text-muted-foreground">Available 24/7</div>
              </div>
              <Badge className="ml-auto border border-orange-200/80 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">Online</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Help Categories */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Browse Help Topics</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {helpCategories.map((category, index) => (
            <Card key={index} className="transition-all duration-200 hover:shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <category.icon className="h-5 w-5 text-orange-500" />
                  <span>{category.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {category.articles.map((article, articleIndex) => (
                    <Button
                      key={articleIndex}
                      variant="ghost"
                      className="w-full justify-start text-sm h-auto py-2"
                    >
                      {article}
                      <ExternalLink className="ml-auto h-3 w-3" />
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Contact Form */}
      <Card>
        <CardHeader>
          <CardTitle>Send us a Message</CardTitle>
          <CardDescription>
            Can't find what you're looking for? Send us a message and we'll get back to you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject</label>
              <Input placeholder="What can we help you with?" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <select className="w-full rounded-md border border-border bg-background p-2 text-foreground">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Urgent</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Message</label>
            <Textarea
              placeholder="Please describe your issue or question in detail..."
              rows={4}
            />
          </div>
          <Button className="w-full">Send Message</Button>
        </CardContent>
      </Card>
    </div>
  );
}
