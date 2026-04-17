import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, Send, Loader2, Check, Plus, Minus, Upload, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { r2Storage } from '@/lib/r2';
import { usePhotographerId } from '@/hooks/usePhotographerId';
import { useToast } from '@/hooks/use-toast';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Extensions } from '@tiptap/react';
import SmartFieldExtension from './SmartFieldExtension';
import ContractBlock from './ContractBlock';

/* ─── Types ────────────────────────────────────────────────────────────── */
interface JobData {
  id: string;
  title: string;
  event_type: string | null;
  event_date: string | null;
  event_time?: string | null;
  location?: string | null;
  total_value?: number | null;
  deposit_value?: number | null;
  album_id: string | null;
  status: string;
  clients: {
    name: string;
    email: string | null;
    whatsapp: string | null;
  } | null;
}

interface PhotographerData {
  name: string;
  slug: string;
  email?: string | null;
}

interface BlockState {
  id: string;
  content: string; // TipTap JSON string
}

interface Props {
  jobId: string;
  onBack: () => void;
  onActionsChange?: (actions: React.ReactNode) => void;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap';
const TEMPLATES = ['Casamento', 'Newborn', 'Ensaios'];

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  enviado:  { label: 'Enviado',  bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
  assinado: { label: 'Assinado', bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
};

type ContractStatus = keyof typeof STATUS_CONFIG;

/* ─── Shared TipTap extensions ─────────────────────────────────────────── */
const sharedExtensions: Extensions = [
  StarterKit,
  UnderlineExt,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
  SmartFieldExtension,
];

/* ─── Smart field node helper ──────────────────────────────────────────── */
function sf(field: string, label: string, value: string, placeholder: string) {
  return {
    type: 'smartField',
    attrs: { field, label, value, placeholder },
  };
}

function text(t: string) {
  return { type: 'text', text: t };
}

function paragraph(content: object[]) {
  return { type: 'paragraph', attrs: { textAlign: 'left' }, content };
}

function heading(level: 1 | 2 | 3, t: string) {
  return {
    type: 'heading',
    attrs: { level, textAlign: 'left' },
    content: [{ type: 'text', text: t }],
  };
}

function bulletList(items: object[][]) {
  return {
    type: 'bulletList',
    content: items.map(itemContent => ({
      type: 'listItem',
      content: [{ type: 'paragraph', attrs: { textAlign: 'left' }, content: itemContent }],
    })),
  };
}

function jsonStr(nodes: object[]): string {
  return JSON.stringify({ type: 'doc', content: nodes });
}

/* ─── Build initial blocks from job data ──────────────────────────────── */
interface FormVars {
  clienteName: string;
  clienteEmail: string;
  clientePhone: string;
  cpfCliente: string;
  photographerName: string;
  cpfFotografo: string;
  emailFotografo: string;
  eventType: string;
  dia: string;
  mes: string;
  ano: string;
  mesNome: string;
  horario: string;
  hora: string;
  min: string;
  local: string;
  duracaoEstimada: string;
  entregaMinima: string;
  valorTotal: string;
  sinal: string;
  saldoRestante: string;
  vencimentoSaldo: string;
  prazoEntrega: string;
  prazoSelecao: string;
  cidade: string;
  template: string;
}

function buildInitialBlocks(vars: FormVars): BlockState[] {
  const {
    clienteName, clienteEmail, clientePhone, cpfCliente,
    photographerName, cpfFotografo, emailFotografo,
    eventType, dia, mes, ano, mesNome, hora, min, local,
    duracaoEstimada, entregaMinima, valorTotal, sinal,
    saldoRestante, vencimentoSaldo, prazoEntrega, prazoSelecao,
    cidade, template,
  } = vars;

  /* Monta data formatada: "30 de abril de 2026" ou vazio */
  const dataFormatada = dia && mesNome && ano ? `${dia} de ${mesNome} de ${ano}` : '';

  /* header */
  const header = jsonStr([
    {
      type: 'paragraph',
      attrs: { textAlign: 'left' },
      content: [{ type: 'text', text: 'Contrato de Prestação de Serviços Fotográficos', marks: [{ type: 'textStyle', attrs: { color: '#a0a0a0' } }] }],
    },
    heading(1, `${template} — Ensaio Fotográfico`),
    paragraph([
      text('Este contrato é celebrado na data de '),
      sf('dataContrato', 'Data do Contrato', dataFormatada, '30 de janeiro de 2025'),
      text('.'),
    ]),
  ]);

  /* parties */
  const parties = jsonStr([
    heading(2, '1. As Partes'),
    paragraph([text('Este Contrato de Prestação de Serviços Fotográficos ("Contrato") é firmado entre:')]),
    paragraph([
      { type: 'text', text: 'Fotógrafo(a) / Contratado(a): ', marks: [{ type: 'bold' }] },
      sf('fotografoNome', 'Nome do Fotógrafo', photographerName, 'Nome do fotógrafo'),
      text(', inscrito(a) sob CPF/CNPJ '),
      sf('cpfFotografo', 'CPF/CNPJ do Fotógrafo', cpfFotografo, '000.000.000-00'),
      text(', e-mail '),
      sf('emailFotografo', 'E-mail do Fotógrafo', emailFotografo, 'email@exemplo.com'),
      text(';'),
    ]),
    paragraph([
      { type: 'text', text: 'Cliente / Contratante: ', marks: [{ type: 'bold' }] },
      sf('cliente', 'Nome do Cliente', clienteName, 'Nome do cliente'),
      text(', CPF '),
      sf('cpfCliente', 'CPF do Cliente', cpfCliente, '000.000.000-00'),
      text(', telefone '),
      sf('telefoneCliente', 'Telefone do Cliente', clientePhone, '(00) 00000-0000'),
      text(', e-mail '),
      sf('emailCliente', 'E-mail do Cliente', clienteEmail, 'email@exemplo.com'),
      text('.'),
    ]),
    paragraph([text('Doravante denominadas, em conjunto, como "as Partes".')]),
  ]);

  /* Monta data e hora do evento */
  const dataEvento = dia && mesNome && ano ? `${dia} de ${mesNome} de ${ano}` : '';
  const horaEvento = hora && min ? `${hora}h${min}` : '';

  /* service */
  const service = jsonStr([
    heading(2, '2. Objeto do Contrato'),
    paragraph([
      text('O Fotógrafo prestará serviços de ensaio fotográfico do tipo '),
      sf('tipoEnsaio', 'Tipo de Ensaio', eventType, 'tipo de ensaio'),
      text(', a realizar-se no dia '),
      sf('dataEvento', 'Data do Evento', dataEvento, '30 de janeiro de 2025'),
      text(', às '),
      sf('horaEvento', 'Horário do Evento', horaEvento, '14h00'),
      text(', no local: '),
      sf('local', 'Local do Ensaio', local, 'Endereço do local'),
      text('.'),
    ]),
    paragraph([
      text('A duração estimada é de '),
      sf('duracaoEstimada', 'Duração (horas)', duracaoEstimada, '--'),
      text(' hora(s). A entrega mínima será de '),
      sf('entregaMinima', 'Fotos mínimas', entregaMinima, '--'),
      text(' fotografias editadas, entregues em formato digital via galeria online.'),
    ]),
  ]);

  /* payment */
  const payment = jsonStr([
    heading(2, '3. Investimento e Forma de Pagamento'),
    paragraph([
      text('O valor total acordado para os serviços é de R$ '),
      sf('valorTotal', 'Valor Total', valorTotal, '0,00'),
      text(', divididos da seguinte forma:'),
    ]),
    bulletList([
      [
        { type: 'text', text: 'Sinal na assinatura (reserva de data): R$ ', marks: [] },
        sf('sinal', 'Sinal', sinal, '0,00'),
        text(' — valor não reembolsável.'),
      ],
      [
        { type: 'text', text: 'Saldo restante: R$ ', marks: [] },
        sf('saldoRestante', 'Saldo Restante', saldoRestante, '0,00'),
        text(', com vencimento em '),
        sf('vencimentoSaldo', 'Data de vencimento', vencimentoSaldo, 'DD/MM/AAAA'),
        text('.'),
      ],
    ]),
    paragraph([text('Formas de pagamento aceitas: PIX, transferência bancária, dinheiro ou cartão. A entrega das fotografias fica condicionada à quitação integral do contrato. Atraso no pagamento implica multa de 2% + juros de 1% ao mês.')]),
  ]);

  /* cancellation */
  const cancellation = jsonStr([
    heading(2, '4. Cancelamento e Remarcação'),
    bulletList([
      [text('Cancelamento com mais de 30 dias de antecedência: perda do sinal.')],
      [text('Cancelamento entre 8 e 29 dias: perda do sinal acrescida de 50% do saldo restante.')],
      [text('Cancelamento com menos de 7 dias ou no próprio dia: cobrança integral do valor contratado.')],
      [text('Remarcação permitida até 2 vezes sem custo, com mínimo de 30 dias de antecedência. A partir da 3ª remarcação, será cobrada taxa adicional.')],
    ]),
  ]);

  /* delivery */
  const delivery = jsonStr([
    heading(2, '5. Entrega, Seleção e Backup'),
    paragraph([
      text('As fotografias editadas serão disponibilizadas em até '),
      sf('prazoEntrega', 'Prazo de Entrega (dias)', prazoEntrega, '60'),
      text(' dias corridos após a realização do ensaio, condicionado à quitação integral.'),
    ]),
    bulletList([
      [
        { type: 'text', text: 'Seleção: O cliente terá ', marks: [] },
        sf('prazoSelecao', 'Prazo de Seleção (dias)', prazoSelecao, '15'),
        text(' dias para selecionar as imagens após receber a galeria bruta.'),
      ],
      [text('Arquivos RAW: Não serão entregues fotografias sem edição ou arquivos em formato RAW.')],
      [text('Backup: O link da galeria permanecerá disponível por 30 dias. Após esse prazo, o fotógrafo não tem obrigação contratual de manter os arquivos.')],
    ]),
  ]);

  /* copyright */
  const copyright = jsonStr([
    heading(2, '6. Direitos Autorais e Uso de Imagem'),
    paragraph([text('Todas as fotografias produzidas são obras intelectuais do(a) Fotógrafo(a), protegidas pela Lei nº 9.610/98. O pagamento concede ao Cliente licença de uso pessoal e não comercial. O crédito fotográfico é obrigatório em todas as publicações em redes sociais.')]),
    paragraph([text('O uso indevido das imagens — incluindo fins comerciais, remoção de crédito ou revenda — sujeita o Cliente a indenização mínima de R$ 5.000,00 por imagem, conforme a Lei nº 9.610/98.')]),
    paragraph([
      { type: 'text', text: 'Autorização de divulgação pelo Fotógrafo: ', marks: [{ type: 'bold' }] },
      text('O Cliente autoriza o uso das imagens para portfólio, site e redes sociais do estúdio. (Remova ou ajuste conforme o acordo.)'),
    ]),
  ]);

  /* general */
  const general = jsonStr([
    heading(2, '7. Responsabilidades e Disposições Gerais'),
    bulletList([
      [
        { type: 'text', text: 'Inadimplência: ', marks: [{ type: 'bold' }] },
        text('As imagens serão retidas até quitação integral, com multa de 2% + juros de 1% ao mês + IPCA.'),
      ],
      [
        { type: 'text', text: 'Força maior: ', marks: [{ type: 'bold' }] },
        text('Em caso de falha técnica inevitável ou evento de força maior, a responsabilidade do Fotógrafo limita-se à devolução dos valores pagos.'),
      ],
      [
        { type: 'text', text: 'Ausência do Fotógrafo: ', marks: [{ type: 'bold' }] },
        text('Em caso de falta injustificada, devolução integral + multa equivalente a 100% do valor contratado.'),
      ],
      [
        { type: 'text', text: 'Foro: ', marks: [{ type: 'bold' }] },
        text('Comarca de '),
        sf('cidade', 'Cidade / Estado', cidade, 'Cidade/UF'),
        text('. Assinatura eletrônica com validade jurídica plena, conforme Lei nº 14.063/2020.'),
      ],
    ]),
  ]);

  /* closing */
  const closing = jsonStr([
    paragraph([
      { type: 'text', text: 'As Partes declaram ter lido, compreendido e concordado com todas as condições estabelecidas neste instrumento, que é firmado em duas vias de igual teor.', marks: [{ type: 'italic' }] },
    ]),
    paragraph([
      sf('cidadeAssinatura', 'Cidade', cidade, 'Cidade'),
      text(', '),
      sf('diaAssinatura', 'Dia', '', '--'),
      text(' de '),
      sf('mesAssinaturaNome', 'Mês por extenso', '', '___________'),
      text(' de '),
      sf('anoAssinatura', 'Ano', '', '----'),
      text('.'),
    ]),
  ]);

  /* signatures */
  const signatures = jsonStr([
    paragraph([
      text('_________________________________          _________________________________'),
    ]),
    paragraph([
      { type: 'text', text: `${photographerName || '[Nome do Fotógrafo]'}`, marks: [{ type: 'bold' }] },
      text('          '),
      { type: 'text', text: `${clienteName || '[Nome do Cliente]'}`, marks: [{ type: 'bold' }] },
    ]),
    paragraph([text('Fotógrafo(a) — Contratado(a)          Cliente — Contratante')]),
  ]);

  return [
    { id: 'header', content: header },
    { id: 'parties', content: parties },
    { id: 'service', content: service },
    { id: 'payment', content: payment },
    { id: 'cancellation', content: cancellation },
    { id: 'delivery', content: delivery },
    { id: 'copyright', content: copyright },
    { id: 'general', content: general },
    { id: 'closing', content: closing },
    { id: 'signatures', content: signatures },
  ];
}

/* ─── Page shell ─────────────────────────────────────────────────────── */
interface PageProps {
  children: React.ReactNode;
  photographerName: string;
  logoUrl?: string | null;
  isFirstPage?: boolean;
  onLogoClick?: () => void;
  onLogoRemove?: () => void;
  uploadingLogo?: boolean;
}

const Page = ({ children, photographerName, logoUrl, isFirstPage, onLogoClick, onLogoRemove, uploadingLogo }: PageProps) => (
  <div className="a4-page">
    {/* Logo area — só na primeira página */}
    {isFirstPage && (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        borderBottom: '1px solid #e8e8e8', paddingBottom: 20, marginBottom: 28,
      }}>
        {logoUrl ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src={logoUrl} alt="Logo" style={{ maxHeight: 72, maxWidth: 280, objectFit: 'contain', display: 'block' }} />
            {onLogoRemove && (
              <button
                onClick={onLogoRemove}
                contentEditable={false}
                style={{
                  position: 'absolute', top: -8, right: -8,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#e5e7eb', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#6b7280', lineHeight: 1,
                }}
                title="Remover logo"
              >✕</button>
            )}
          </div>
        ) : (
          <div
            onClick={onLogoClick}
            style={{
              width: '100%', padding: '28px 0', cursor: onLogoClick ? 'pointer' : 'default',
              border: '1.5px dashed #d1d5db', borderRadius: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              background: '#fafafa', transition: 'background 150ms',
            }}
            onMouseEnter={e => { if (onLogoClick) (e.currentTarget as HTMLDivElement).style.background = '#f3f4f6'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#fafafa'; }}
          >
            {uploadingLogo ? (
              <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'Montserrat, sans-serif' }}>Enviando...</span>
            ) : (
              <>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Montserrat, sans-serif' }}>
                  {photographerName || 'Your Logo'}
                </span>
                {onLogoClick && (
                  <span style={{ fontSize: 10, color: '#c4c9d4', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'Montserrat, sans-serif' }}>
                    Clique para adicionar sua logo
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )}

    {/* Rodapé de página com nome do fotógrafo (páginas sem logo) */}
    {!isFirstPage && (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid #e8e8e8', paddingBottom: 8, marginBottom: 24,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'Montserrat, sans-serif' }}>
          {photographerName || '[NOME DO FOTÓGRAFO]'}
        </span>
        <span style={{ fontSize: 10, color: '#aaa', fontStyle: 'italic', fontFamily: 'Montserrat, sans-serif' }}>
          Contrato de Serviços Fotográficos
        </span>
      </div>
    )}

    <div className="page-body">{children}</div>
    <div style={{
      position: 'absolute', bottom: 32, left: 64, right: 64,
      borderTop: '1px solid #ebebeb', paddingTop: 8,
      textAlign: 'center', color: '#bbb', fontStyle: 'italic',
      fontSize: 9, fontFamily: 'Montserrat, sans-serif',
    }}>
      Documento com validade jurídica plena — Lei nº 9.610/98 e Lei nº 14.063/2020
    </div>
  </div>
);

/* ─── Main component ─────────────────────────────────────────────────── */
export default function AdminContractCreate({ jobId, onBack, onActionsChange }: Props) {
  const photographerId = usePhotographerId();
  const { toast } = useToast();

  const [job, setJob] = useState<JobData | null>(null);
  const [photographer, setPhotographer] = useState<PhotographerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractStatus, setContractStatus] = useState<ContractStatus>('rascunho');
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [zoom, setZoom] = useState(0.75);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState('#2f5496');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [blocks, setBlocks] = useState<BlockState[]>([]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  /* ── Logo upload ── */
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !photographerId) return;

    // Limite de 2MB para logo (base64 aumenta ~33%)
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Logo muito grande', description: 'Use uma imagem menor que 2MB.', variant: 'destructive' });
      return;
    }

    setUploadingLogo(true);
    try {
      // Converte para base64 — logo é pequena e fica independente de CORS/R2
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setLogoUrl(dataUrl);
      await supabase.from('photographers')
        .update({ logo_url: dataUrl, logo_key: null })
        .eq('id', photographerId);
      toast({ title: 'Logo salva com sucesso!' });
    } catch {
      toast({ title: 'Erro ao fazer upload da logo', variant: 'destructive' });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!photographerId) return;
    if (logoKey) await r2Storage.delete(logoKey);
    setLogoUrl(null);
    setLogoKey(null);
    await supabase.from('photographers').update({ logo_url: null, logo_key: null }).eq('id', photographerId);
  };

  const handleBrandColorChange = async (color: string) => {
    setBrandColor(color);
    document.documentElement.style.setProperty('--fotux-brand-color', color);
    if (!photographerId) return;
    await supabase.from('photographers').update({ brand_color: color }).eq('id', photographerId);
  };

  // Sincroniza CSS variable no root quando brandColor é carregado do banco
  useEffect(() => {
    document.documentElement.style.setProperty('--fotux-brand-color', brandColor);
  }, [brandColor]);

  /* ── Load job + photographer ── */
  useEffect(() => {
    if (!photographerId) return;
    const load = async () => {
      const [jobRes, photoRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, title, event_type, event_date, album_id, status, clients(name, email, whatsapp)')
          .eq('id', jobId)
          .single(),
        supabase
          .from('photographers')
          .select('name, slug, email, logo_url, logo_key, brand_color')
          .eq('id', photographerId)
          .single(),
      ]);

      const jobData = jobRes.data as unknown as JobData;
      setJob(jobData);
      const photoData = photoRes.data as unknown as PhotographerData & { logo_url?: string | null; logo_key?: string | null; brand_color?: string | null };
      setPhotographer(photoData);
      if (photoData?.logo_url) {
        setLogoUrl(photoData.logo_url);
      }
      if (photoData?.brand_color) setBrandColor(photoData.brand_color);

      if (jobData) {
        const datePart = jobData.event_date?.split('T')[0] ?? '';
        const mesesPtBR = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
        const mesIndex = datePart ? parseInt(datePart.split('-')[1], 10) - 1 : -1;
        const mesNomeAuto = mesIndex >= 0 ? mesesPtBR[mesIndex] : '';
        const [ano, mes, dia] = datePart ? datePart.split('-') : ['', '', ''];
        const totalVal = jobData.total_value ?? 0;
        const depositVal = jobData.deposit_value ?? 0;
        const saldo = totalVal - depositVal;

        const tpl = (() => {
          if (!jobData.event_type) return 'Ensaios';
          const lower = jobData.event_type.toLowerCase();
          if (lower.includes('casamento')) return 'Casamento';
          if (lower.includes('newborn') || lower.includes('gestante')) return 'Newborn';
          return 'Ensaios';
        })();
        setTemplate(tpl);

        /* Try loading existing contract JSON */
        if (jobData.album_id) {
          const { data: ct } = await supabase
            .from('contracts')
            .select('id, body_html, signed_at')
            .eq('album_id', jobData.album_id)
            .maybeSingle();

          if (ct) {
            setContractId(ct.id);
            setContractStatus(ct.signed_at ? 'assinado' : jobData.status === 'contract_pending' ? 'enviado' : 'rascunho');

            /* Try parsing saved JSON blocks */
            if (ct.body_html && ct.body_html.trim().startsWith('[')) {
              try {
                const parsed = JSON.parse(ct.body_html) as BlockState[];
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setBlocks(parsed);
                  setLoading(false);
                  return;
                }
              } catch {
                /* fall through to build initial */
              }
            }
          }
        }

        /* Build from job data */
        const vars: FormVars = {
          clienteName: jobData.clients?.name ?? '',
          clienteEmail: jobData.clients?.email ?? '',
          clientePhone: jobData.clients?.whatsapp ?? '',
          cpfCliente: '',
          photographerName: photoData?.name ?? '',
          cpfFotografo: '',
          emailFotografo: (photoData as any)?.email ?? '',
          eventType: jobData.event_type ?? tpl,
          dia: dia ?? '',
          mes: mes ?? '',
          ano: ano ?? '',
          mesNome: mesNomeAuto,
          horario: '',
          hora: '',
          min: '',
          local: '',
          duracaoEstimada: '',
          entregaMinima: '',
          valorTotal: totalVal ? totalVal.toFixed(2).replace('.', ',') : '',
          sinal: depositVal ? depositVal.toFixed(2).replace('.', ',') : '',
          saldoRestante: (totalVal && depositVal && saldo > 0) ? saldo.toFixed(2).replace('.', ',') : '',
          vencimentoSaldo: '',
          prazoEntrega: '60',
          prazoSelecao: '15',
          cidade: '',
          template: tpl,
        };
        setBlocks(buildInitialBlocks(vars));
      }
      setLoading(false);
    };
    load();
  }, [jobId, photographerId]);

  /* ── Sync label ── */
  const triggerSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setSyncLabel('salvando…');
    syncTimer.current = setTimeout(() => setSyncLabel('salvo agora'), 800);
  }, []);
  useEffect(() => () => { if (syncTimer.current) clearTimeout(syncTimer.current); }, []);

  /* ── Block change handler ── */
  const handleBlockChange = useCallback((id: string, json: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content: json } : b));
    triggerSync();
  }, [triggerSync]);

  /* ── Build contract JSON ── */
  const buildContractJson = () => JSON.stringify(blocks);

  /* ── Save draft ── */
  const handleSaveDraft = async () => {
    if (!photographerId || !job) return;
    if (!job.album_id) {
      toast({ title: 'Álbum necessário', description: 'Vincule um álbum ao trabalho para salvar o contrato.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const bodyHtml = buildContractJson();
    if (contractId) {
      await supabase.from('contracts').update({ body_html: bodyHtml }).eq('id', contractId);
    } else {
      const { data } = await supabase.from('contracts').insert({
        album_id: job.album_id, photographer_id: photographerId, job_id: job.id, body_html: bodyHtml,
      }).select('id').single();
      if (data) setContractId(data.id);
    }
    toast({ title: 'Rascunho salvo!' });
    setSaving(false);
  };

  /* ── Send ── */
  const handleSend = async () => {
    if (!photographerId || !job) return;
    if (!job.album_id) {
      toast({ title: 'Álbum necessário', description: 'Para enviar o contrato ao cliente é preciso vincular um álbum ao trabalho.', variant: 'destructive' });
      return;
    }
    setSending(true);
    const bodyHtml = buildContractJson();
    if (contractId) {
      await supabase.from('contracts').update({ body_html: bodyHtml }).eq('id', contractId);
    } else {
      const { data } = await supabase.from('contracts').insert({
        album_id: job.album_id, photographer_id: photographerId, job_id: job.id, body_html: bodyHtml,
      }).select('id').single();
      if (data) setContractId(data.id);
    }
    await supabase.from('jobs').update({ status: 'contract_pending' }).eq('id', jobId);
    setContractStatus('enviado');
    const contractLink = photographer
      ? `${window.location.origin}/p/${photographer.slug}/${job.album_id}/contrato`
      : null;
    if (contractLink) {
      await navigator.clipboard.writeText(contractLink).catch(() => {});
      toast({ title: 'Contrato enviado!', description: 'Link copiado. Envie ao cliente pelo WhatsApp ou e-mail.' });
    } else {
      toast({ title: 'Contrato salvo e ativado!' });
    }
    setSending(false);
  };

  // Sobe os botões de ação para o header do layout pai
  useEffect(() => {
    if (!onActionsChange) return;
    onActionsChange(
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {syncLabel && <span className="cc-sync" style={{ fontSize: 11, color: '#B0AFA9' }}>{syncLabel}</span>}
        <button className="cc-btn" onClick={handleSaveDraft} disabled={saving}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Salvar rascunho
        </button>
        <button className="cc-btn cc-btn-primary" onClick={handleSend} disabled={sending}>
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Enviar para cliente
        </button>
      </div>
    );
  }, [saving, sending, syncLabel]);

  /* ── Loading ── */
  if (loading || !job) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F0EEE9]">
        <Loader2 className="h-7 w-7 animate-spin text-zinc-400" />
      </div>
    );
  }

  const photographerName = photographer?.name ?? '';
  const st = STATUS_CONFIG[contractStatus];

  /* Which blocks go on page 1 vs page 2 */
  const page1Ids = ['header', 'parties', 'service', 'payment', 'cancellation', 'delivery'];
  const page2Ids = ['copyright', 'general', 'closing', 'signatures'];
  const page1Blocks = blocks.filter(b => page1Ids.includes(b.id));
  const page2Blocks = blocks.filter(b => page2Ids.includes(b.id));

  return (
    <>
      <style>{`
        @import url('${FONT_URL}');

        .cc-shell {
          display: flex; flex-direction: column; height: 100vh; overflow: hidden;
          font-family: 'Montserrat', sans-serif; color: #1C1C1A;
          background: #F5F5F7;
        }
        .cc-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px; height: 56px; flex-shrink: 0;
          background: #fff; border-bottom: 1px solid #E2DFD8; z-index: 50;
        }
        .cc-topbar-left { display: flex; align-items: center; gap: 10px; }
        .cc-back-btn {
          display: flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 7px;
          border: 1px solid #E2DFD8; background: transparent;
          cursor: pointer; color: #6B6B67; transition: background 120ms;
        }
        .cc-back-btn:hover { background: #F4F2EC; }
        .cc-title { font-size: 14px; font-weight: 600; color: #1C1C1A; }
        .cc-subtitle { font-size: 11px; color: #9B9B95; margin-top: 1px; }
        .cc-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 500;
        }
        .cc-badge-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .cc-topbar-actions { display: flex; align-items: center; gap: 8px; }
        .cc-sync { font-size: 11px; color: #B0AFA9; }
        .cc-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 0 14px; height: 34px; border-radius: 7px;
          font-size: 13px; font-weight: 500; cursor: pointer;
          border: 1px solid #D4D2CC; background: #fff; color: #3D3D3A;
          transition: background 120ms; font-family: 'Montserrat', sans-serif;
        }
        .cc-btn:hover { background: #F4F2EC; }
        .cc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .cc-btn-primary { background: #18181b; color: #fff; border-color: #18181b; }
        .cc-btn-primary:hover { background: #27272a; }

        .cc-side-panel {
          position: fixed; right: 20px; top: 50%; transform: translateY(-50%);
          z-index: 100; display: flex; flex-direction: column; gap: 4px;
          background: #fff; border: 1px solid #E2DFD8; border-radius: 12px;
          padding: 8px 6px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        }
        .cc-side-label {
          font-size: 9px; font-weight: 600; letter-spacing: 0.08em;
          text-transform: uppercase; color: #B0AFA9; text-align: center;
          padding: 0 4px 4px; border-bottom: 1px solid #F0EEE9; margin-bottom: 2px;
        }
        .cc-side-pill {
          padding: 5px 10px; border-radius: 7px; font-size: 11px;
          font-weight: 500; cursor: pointer; border: none;
          background: transparent; color: #6B6B67;
          font-family: 'Montserrat', sans-serif; transition: all 150ms;
          white-space: nowrap; text-align: left;
        }
        .cc-side-pill:hover { background: #F4F2EC; color: #1C1C1A; }
        .cc-side-pill.active { background: #F0EFEC; color: #1C1C1A; font-weight: 600; }

        .cc-tip-banner {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; color: #9B9B95;
          margin-bottom: 16px; padding: 7px 14px 7px 12px;
          background: #FAFAFA; border-radius: 8px;
          border: 1px solid #ECECEC;
        }
        .cc-tip-close {
          margin-left: auto; cursor: pointer; color: #C0BFB9;
          background: none; border: none; padding: 0; line-height: 1;
          font-size: 14px; transition: color 120ms;
        }
        .cc-tip-close:hover { color: #6B6B67; }

        .cc-branding-bar {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 16px; padding: 8px 14px;
          background: #fff; border-radius: 10px;
          border: 1px solid #ECECEC;
          font-family: 'Montserrat', sans-serif;
          width: 860px; box-sizing: border-box;
        }
        .cc-branding-logo-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 5px 12px; border-radius: 7px; cursor: pointer;
          border: 1px dashed #D0CFC9; background: #FAFAF8;
          font-size: 11px; color: #9B9B95; transition: all 150ms;
          font-family: 'Montserrat', sans-serif;
        }
        .cc-branding-logo-btn:hover { border-color: #aaa; color: #555; background: #F4F2EC; }
        .cc-branding-sep { width: 1px; height: 24px; background: #ECECEC; flex-shrink: 0; }
        .cc-branding-color-label { font-size: 10px; color: #B0AFA9; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
        .cc-branding-color-swatch {
          width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff;
          box-shadow: 0 0 0 1px #D0CFC9; cursor: pointer; flex-shrink: 0; transition: transform 120ms;
        }
        .cc-branding-color-swatch:hover { transform: scale(1.12); }
        .cc-branding-logo-preview { max-height: 28px; max-width: 120px; object-fit: contain; border-radius: 4px; }
        .cc-branding-remove {
          display: flex; align-items: center; justify-content: center;
          width: 18px; height: 18px; border-radius: 50%; border: none;
          background: #E8E8E8; color: #888; cursor: pointer; font-size: 10px;
          transition: background 120ms;
        }
        .cc-branding-remove:hover { background: #fcd4d4; color: #c00; }

        .cc-canvas {
          flex: 1; overflow-y: auto; overflow-x: auto;
          display: flex; flex-direction: column; align-items: center;
          padding: 32px 0 80px; background: #F5F5F7;
        }

        .cc-zoom-bar {
          position: fixed; bottom: 24px; right: 24px; z-index: 100;
          display: flex; align-items: center; gap: 4px;
          background: #fff; border: 1px solid #D4D2CC; border-radius: 8px;
          padding: 4px 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .cc-zoom-btn {
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border-radius: 5px;
          border: none; background: transparent; cursor: pointer;
          color: #3f3f46; transition: background 120ms;
        }
        .cc-zoom-btn:hover { background: #F4F2EC; }
        .cc-zoom-val { font-size: 11px; font-weight: 600; color: #3f3f46; width: 34px; text-align: center; }

        .a4-page {
          width: 860px; min-height: 1215px; background: #ffffff;
          margin: 0 auto 40px auto;
          box-shadow: 0 8px 48px rgba(0,0,0,0.06), 0 2px 12px rgba(0,0,0,0.04);
          border-radius: 4px;
          display: flex; flex-direction: column;
          font-family: 'Montserrat', sans-serif; color: #333;
          font-size: 12px; line-height: 1.7;
          padding: 56px 80px; box-sizing: border-box;
          flex-shrink: 0; position: relative;
        }
        .page-body { flex: 1; display: flex; flex-direction: column; margin-bottom: 40px; gap: 2px; }

        /* TipTap content typography inside A4 */
        .a4-page .tiptap h1 { font-size: 22px; font-weight: 500; letter-spacing: 0.04em; color: #1a1a1a; margin: 0 0 4px; line-height: 1.2; }
        .a4-page .tiptap h2 {
          font-size: 13px; font-weight: 700; color: #1a1a1a;
          margin: 20px 0 8px; padding-bottom: 6px;
          border-bottom: 1.5px solid #e0e0e0;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .a4-page .tiptap h3 { font-size: 12px; font-weight: 700; margin: 12px 0 4px; }
        .a4-page .tiptap p { font-size: 12px; color: #333; margin: 0 0 8px; line-height: 1.7; }
        .a4-page .tiptap ul { margin: 0 0 10px; padding-left: 20px; list-style-type: disc; }
        .a4-page .tiptap ul li { font-size: 12px; color: #333; line-height: 1.7; margin-bottom: 4px; }
        .a4-page .tiptap:focus { outline: none; }

        /* Smart field token styles */
        .smart-field-token {
          display: inline-block; border-radius: 4px; padding: 2px 8px;
          cursor: pointer; font-size: inherit;
        }
      `}</style>

      <div className="cc-shell" style={{ '--brand-color': brandColor } as React.CSSProperties}>


        {/* Template selector — painel lateral fixo */}
        <div className="cc-side-panel">
          <span className="cc-side-label">Modelo</span>
          {TEMPLATES.map(t => (
            <button
              key={t}
              className={`cc-side-pill${template === t ? ' active' : ''}`}
              onClick={() => setTemplate(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="cc-canvas" ref={canvasRef}>

          {/* Branding bar — apenas cor de destaque */}
          <div className="cc-branding-bar">
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            <div className="cc-branding-sep" />
            <span className="cc-branding-color-label">Cor de destaque</span>
            <input
              type="color"
              value={brandColor}
              onChange={e => handleBrandColorChange(e.target.value)}
              style={{ opacity: 0, position: 'absolute', pointerEvents: 'none', width: 0, height: 0 }}
              id="brand-color-input"
            />
            <label
              htmlFor="brand-color-input"
              className="cc-branding-color-swatch"
              style={{ background: brandColor }}
              title="Clique para alterar a cor de destaque"
            />
            <span style={{ fontSize: 11, color: '#9B9B95', fontFamily: 'Montserrat, sans-serif' }}>{brandColor}</span>
          </div>

          {!tipDismissed && (
            <div className="cc-tip-banner">
              <span style={{ fontSize: 13, lineHeight: 1 }}>✦</span>
              Duplo clique em qualquer seção para editar · Clique nos campos destacados para preencher
              <button className="cc-tip-close" onClick={() => setTipDismissed(true)} title="Fechar dica">✕</button>
            </div>
          )}

          <div style={{ zoom, transformOrigin: 'top center' }}>

            {/* Page 1 */}
            <Page
              photographerName={photographerName}
              logoUrl={logoUrl}
              isFirstPage
              onLogoClick={() => logoInputRef.current?.click()}
              onLogoRemove={handleRemoveLogo}
              uploadingLogo={uploadingLogo}
            >
              <div className="page-body">
                {page1Blocks.map(block => (
                  <ContractBlock
                    key={block.id}
                    id={block.id}
                    initialContent={block.content}
                    onChange={handleBlockChange}
                    extensions={sharedExtensions}
                  />
                ))}
              </div>
            </Page>

            {/* Page 2 */}
            <Page photographerName={photographerName} logoUrl={logoUrl}>
              <div className="page-body">
                {page2Blocks.map(block => (
                  <ContractBlock
                    key={block.id}
                    id={block.id}
                    initialContent={block.content}
                    onChange={handleBlockChange}
                    extensions={sharedExtensions}
                  />
                ))}
              </div>
            </Page>

          </div>
        </div>

        {/* Zoom control */}
        <div className="cc-zoom-bar">
          <button className="cc-zoom-btn" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.05).toFixed(2)))} title="Diminuir zoom">
            <Minus size={13} />
          </button>
          <span className="cc-zoom-val">{Math.round(zoom * 100)}%</span>
          <button className="cc-zoom-btn" onClick={() => setZoom(z => Math.min(1.5, +(z + 0.05).toFixed(2)))} title="Aumentar zoom">
            <Plus size={13} />
          </button>
        </div>

      </div>
    </>
  );
}
