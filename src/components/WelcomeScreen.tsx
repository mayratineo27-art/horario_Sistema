import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';

interface WelcomeScreenProps {
  isLoading: boolean;
  onSignInClick?: () => void;
}

export const WelcomeScreen = ({ isLoading, onSignInClick }: WelcomeScreenProps) => {
  const handleSignIn = async () => {
    try {
      onSignInClick?.();
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-900 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center space-y-8 max-w-sm"
      >
        {/* Logo / Branding */}
        <div className="space-y-4">
          <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-900 to-blue-900">
            Mya Dynamics
          </div>
          <p className="text-lg text-slate-600 font-semibold">Tu asistente de horarios personal</p>
        </div>

        {/* Features */}
        <div className="space-y-3 text-left">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📅</span>
            <p className="text-sm text-slate-600">Gestiona tu horario de forma inteligente</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔔</span>
            <p className="text-sm text-slate-600">Recibe notificaciones en el momento exacto</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">☁️</span>
            <p className="text-sm text-slate-600">Tu información sincronizada en la nube</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎨</span>
            <p className="text-sm text-slate-600">Personaliza con tus colores favoritos</p>
          </div>
        </div>

        {/* Sign In Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSignIn}
          className="w-full bg-indigo-900 text-white rounded-2xl py-4 px-6 font-bold text-lg flex items-center justify-center gap-3 hover:bg-indigo-950 transition-colors shadow-lg"
        >
          <LogIn className="w-5 h-5" />
          Continuar como Anónimo
        </motion.button>

        {/* Footer */}
        <p className="text-xs text-slate-500">
          Al continuar aceptas nuestros términos de servicio y política de privacidad
        </p>
      </motion.div>
    </div>
  );
};
