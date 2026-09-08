'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Logo } from './logo';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(''); const data = new FormData(event.currentTarget); const body = mode === 'login' ? { email: data.get('email'), password: data.get('password') } : { name: data.get('name'), workspaceName: data.get('workspaceName'), email: data.get('email'), password: data.get('password') }; try { await apiClient(`/api/v1/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) }); window.location.assign(mode === 'login' ? '/workspaces' : '/dashboard'); } catch (caught) { setError(caught instanceof Error ? caught.message : '请求失败，请稍后重试。'); setPending(false); } }
  return <form className="auth-form" onSubmit={submit}><Logo /><h1>{mode === 'login' ? '登录工作台' : '创建工作区'}</h1><p>{mode === 'login' ? '继续处理市场路线、触达机会与待执行行动。' : '建立第一个工业品市场进入任务。'}</p><div className="auth-fields">{mode === 'register' && <><div className="field"><label htmlFor="name">姓名</label><input className="input" id="name" name="name" autoComplete="name" required /></div><div className="field"><label htmlFor="workspaceName">工作区名称</label><input className="input" id="workspaceName" name="workspaceName" required /></div></>}<div className="field"><label htmlFor="email">邮箱</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div><div className="field"><label htmlFor="password">密码</label><input className="input" id="password" name="password" type="password" minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></div>{error && <div className="error-state" role="alert">{error}</div>}<button className="button button-primary auth-submit" disabled={pending} type="submit">{pending ? '正在处理…' : mode === 'login' ? '登录' : '创建账户'}</button></div><div className="auth-switch">{mode === 'login' ? <>还没有账户？ <Link href="/register">创建工作区</Link></> : <>已有账户？ <Link href="/login">登录</Link></>}</div></form>;
}
