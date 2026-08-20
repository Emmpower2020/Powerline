"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap, Loader2, AlertCircle } from "lucide-react";

export function LoginForm() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password) {
      setError("نام کاربری و رمز عبور را وارد کنید");
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطا در ورود";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-md">
        {/* لوگو */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4">
            <Zap className="w-9 h-9 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 text-center">
            سیستم مدیریت خطوط انتقال برق
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            پلتفرم نظارت و نگهداری خطوط انتقال و فوق‌انتقال
          </p>
        </div>

        <Card className="shadow-xl border-slate-200/60">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">ورود به سیستم</CardTitle>
            <CardDescription>
              برای ادامه، نام کاربری و رمز عبور خود را وارد کنید
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="username">نام کاربری</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="نام کاربری"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">رمز عبور</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    در حال ورود...
                  </>
                ) : (
                  "ورود"
                )}
              </Button>

              <div className="text-center text-xs text-slate-500 pt-2 border-t">
                <p>
                  پیش‌فرض: <code className="bg-slate-100 px-1.5 py-0.5 rounded">admin</code> /{" "}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded">admin123</code>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6">
          © ۱۴۰۴ — تمامی حقوق محفوظ است
        </p>
      </div>
    </div>
  );
}
