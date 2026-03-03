import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth } from '@/contexts/AuthContext';
import { BRAND } from '@/lib/brand';
import { toast } from 'sonner';

interface SignupFormProps {
  onToggleMode: () => void;
}

export function SignupForm({ onToggleMode }: SignupFormProps) {
  const { signup, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      await signup(formData.email, formData.password, formData.name);
      toast.success('Account created successfully!');
    } catch (error) {
      toast.error('Signup failed. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Logo */}
      <div className="flex items-center justify-center animate-in fade-in-50 slide-in-from-top-5 duration-700">
        <img src={BRAND.logoSrc} alt={`${BRAND.name} logo`} className="h-16 w-auto max-w-[220px]" />
      </div>
      
      <Card className="animate-in fade-in-50 slide-in-from-bottom-5 duration-700">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
          Get Started
        </CardTitle>
        <CardDescription>
          Create your account to access the platform
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="John Doe"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="transition-all duration-200 focus:scale-[1.01]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="transition-all duration-200 focus:scale-[1.01]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="transition-all duration-200 focus:scale-[1.01]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="transition-all duration-200 focus:scale-[1.01]"
              required
            />
          </div>
          <Button 
            type="submit" 
            className="w-full bg-orange-500 hover:bg-orange-600 transition-colors duration-200" 
            disabled={isLoading}
          >
            {isLoading ? <LoadingSpinner size="sm" /> : 'Create Account'}
          </Button>
        </form>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Already have an account? </span>
          <Button variant="link" className="p-0 h-auto text-orange-600 hover:text-orange-700" onClick={onToggleMode}>
            Sign in
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
