import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth } from '@/contexts/AuthContext';
import { BRAND } from '@/lib/brand';
import { toast } from 'sonner';

interface LoginFormProps {
  onToggleMode: () => void;
}

export function LoginForm({ onToggleMode }: LoginFormProps) {
  const { login, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    try {
      await login(formData.email, formData.password);
      toast.success('Welcome back!');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Login failed. Please try again.';
      toast.error(msg);
      setFieldError(msg);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Logo */}
      <div className="flex flex-col items-center justify-center gap-3 animate-in fade-in-50 slide-in-from-top-5 duration-700">
        <img src={BRAND.logoSrc} alt={`${BRAND.name} logo`} className="h-16 w-auto max-w-[220px]" />
        <div className="text-center">
          <p className={`${BRAND.wordmarkFontClass} text-3xl leading-none tracking-[0.08em] text-foreground uppercase sm:text-4xl`}>
            {BRAND.name.toUpperCase()}
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
            Your AI Marketing Co-Pilot
          </p>
        </div>
      </div>

      <Card className="animate-in fade-in-50 slide-in-from-bottom-5 duration-700">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold text-foreground">
          Welcome Back
        </CardTitle>
        <CardDescription>
          Sign in to your account to continue
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="arjun@company.com"
              value={formData.email}
              onChange={(e) => { setFormData(prev => ({ ...prev, email: e.target.value })); setFieldError(null); }}
              className="transition-colors duration-200"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => { setFormData(prev => ({ ...prev, password: e.target.value })); setFieldError(null); }}
                className="transition-colors duration-200 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldError && (
              <p role="alert" className="text-xs text-red-500">{fieldError}</p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 transition-colors duration-200"
            disabled={isLoading}
          >
            {isLoading ? <LoadingSpinner size="sm" /> : 'Sign In'}
          </Button>
        </form>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Don't have an account? </span>
          <Button variant="link" className="p-0 h-auto text-orange-600 hover:text-orange-700" onClick={onToggleMode}>
            Sign up
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
