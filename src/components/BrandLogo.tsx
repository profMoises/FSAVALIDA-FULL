type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src="/SENAI_logo_2024.png"
      alt="SENAI - Serviço Nacional de Aprendizagem Industrial"
      className={className}
      draggable={false}
    />
  );
}
