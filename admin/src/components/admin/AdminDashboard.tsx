import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Images, FolderOpen, Eye, TrendingUp, Plus, ArrowUpRight, Calendar } from 'lucide-react';

interface Stats {
  totalAlbums: number;
  totalPhotos: number;
  publishedAlbums: number;
  categories: number;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats>({
    totalAlbums: 0,
    totalPhotos: 0,
    publishedAlbums: 0,
    categories: 6,
  });
  const [recentAlbums, setRecentAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [photographerName, setPhotographerName] = useState<string>('fotógrafo');

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: photographer } = await supabase
        .from('photographers')
        .select('id, name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!photographer) return;
      setPhotographerName(photographer.name);

      const [albumsRes, photosRes] = await Promise.all([
        supabase
          .from('albums')
          .select('id, title, category, status, cover_image_url, created_at, photographer_id')
          .eq('photographer_id', photographer.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('site_images')
          .select('id')
          .eq('photographer_id', photographer.id),
      ]);

      const albums = albumsRes.data ?? [];
      setStats({
        totalAlbums: albums.length,
        totalPhotos: photosRes.data?.length ?? 0,
        publishedAlbums: albums.filter(a => a.status === 'published').length,
        categories: 6,
      });
      setRecentAlbums(albums.slice(0, 5));
      setLoading(false);
    };

    fetchStats();
  }, []);

  const statCards = [
    { title: 'Total de Álbuns',  value: stats.totalAlbums,    icon: FolderOpen, trend: '+2 esse mês' },
    { title: 'Fotos no Site',    value: stats.totalPhotos,    icon: Images,     trend: 'Atualizado hoje' },
    { title: 'Publicados',       value: stats.publishedAlbums,icon: Eye,        trend: 'Visíveis no site' },
    { title: 'Categorias',       value: stats.categories,     icon: TrendingUp, trend: 'Seções ativas' },
  ];

  return (
    <div className="space-y-10 animate-fade-in">

      {/* Welcome */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] text-[#666666] mb-1">Bem-vindo(a) de volta</p>
          <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300, letterSpacing: '-0.01em' }} className="text-[28px] text-[#1A1A1A]">
            {photographerName}
          </h2>
        </div>
        <button
          className="flex items-center gap-2 bg-[#C65D3B] text-white rounded-sm px-5 py-2 font-medium text-[13px] hover:bg-[#a34a2e] transition-colors"
        >
          <Plus className="h-4 w-4" /> Novo Álbum
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4 border border-[#E5E7EB] rounded-sm overflow-hidden">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title} className="bg-white p-6 flex items-start justify-between group hover:bg-[#FAFAF8] transition-colors">
              <div>
                <p className="text-[12px] font-medium text-[#666666] uppercase tracking-wide">{stat.title}</p>
                <p className="mt-2 text-[32px] font-light text-[#1A1A1A] leading-none">
                  {loading ? '—' : stat.value}
                </p>
                <p className="mt-2 text-[12px] text-[#999]">{stat.trend}</p>
              </div>
              <div className="p-2 text-[#C65D3B]/40 group-hover:text-[#C65D3B] transition-colors">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Albums */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-[13px] font-medium text-[#666666] uppercase tracking-wide">Álbuns Recentes</h3>
          <span className="text-[13px] text-[#C65D3B] flex items-center gap-1 cursor-pointer hover:underline">
            Ver todos <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>

        {recentAlbums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#999]">
            <FolderOpen className="h-9 w-9 mb-3 opacity-30" />
            <p className="text-[13px]">Nenhum álbum criado ainda.</p>
          </div>
        ) : (
          <div className="border-t border-[#E5E7EB]">
            {recentAlbums.map((album) => (
              <div key={album.id} className="flex items-center gap-4 py-4 border-b border-[#E5E7EB] hover:bg-black/[0.02] transition-colors px-1">
                <div className="h-12 w-12 overflow-hidden rounded-sm bg-[#F2F2F2] shrink-0">
                  {album.cover_image_url ? (
                    <img src={album.cover_image_url} alt={album.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Images className="h-5 w-5 text-[#CCC]" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-medium text-[#1A1A1A] truncate">{album.title}</h4>
                  <div className="flex items-center gap-3 text-[12px] text-[#999] mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(album.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    <span>·</span>
                    <span className="capitalize">{album.category || 'Sem categoria'}</span>
                  </div>
                </div>

                <span className={`text-[11px] px-2.5 py-0.5 rounded-full border ${
                  album.status === 'published'
                    ? 'bg-[#FAF0EC] text-[#C65D3B] border-[#e8c4b8]'
                    : 'bg-[#F2F2F2] text-[#666666] border-[#E5E7EB]'
                }`}>
                  {album.status === 'published' ? 'Publicado' : 'Rascunho'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminDashboard;
