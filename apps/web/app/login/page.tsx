import { AuthForm } from '@/components/auth-form';

export default function LoginPage() { return <main className="auth-shell"><section className="auth-form-side"><AuthForm mode="login" /></section><section className="auth-context"><div><h2>把市场判断变成下一步动作。</h2><p>沿着证据、路线、组织和利益相关者推进，直到形成可以由销售人员直接执行的市场进入行动卡。</p></div><div className="auth-proof"><div><strong>Fact / Inference</strong><span>判断类型明确分离</span></div><div><strong>Primary / Backup</strong><span>主备触达路径并行</span></div><div><strong>Decision Timeline</strong><span>每次变化可追溯</span></div></div></section></main>; }
