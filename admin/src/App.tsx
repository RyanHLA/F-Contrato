import { Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import Auth from '@/pages/Auth';
import Admin from '@/pages/Admin';
import ClientProof from '@/pages/ClientProof';
import ClientAlbum from '@/pages/ClientAlbum';
import ClientContract from '@/pages/ClientContract';

const App = () => {
  return (
    <>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/admin" element={<Admin />} />
        {/* Rota legada — mantida para links já compartilhados */}
        <Route path="/cliente/:albumId" element={<ClientProof />} />
        {/* Nova rota multi-tenant com slug do fotógrafo */}
        <Route path="/p/:slug/:albumId" element={<ClientAlbum />} />
        {/* Contrato digital — acessado antes da galeria */}
        <Route path="/p/:slug/:albumId/contrato" element={<ClientContract />} />
      </Routes>
      <Toaster />
    </>
  );
};

export default App;
