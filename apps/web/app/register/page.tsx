import { AuthForm } from '@/components/auth-form';

export default function RegisterPage() { return <main className="auth-shell"><section className="auth-form-side"><AuthForm mode="register" /></section><section className="auth-context"><div><h2>从企业资料到可触达机会。</h2><p>创建任务后，系统按人工审批点推进市场路线、生态发现、联系人验证和行动卡生成。</p></div><div className="auth-proof"><div><strong>Evidence Ledger</strong><span>能力声明绑定来源</span></div><div><strong>Route Review</strong><span>用户批准后继续</span></div><div><strong>Feedback Loop</strong><span>真实互动更新判断</span></div></div></section></main>; }
