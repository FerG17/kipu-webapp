<script setup>
import LegalLayout from './legal-layout.vue';
</script>

<template>
  <LegalLayout title="Política de Privacidad" updated-at="23/08/2026">
    <h2>1. Quiénes somos</h2>
    <p>
      Kipu es una aplicación de gestión de inventario, ventas y punto de venta para
      bodegas y pequeños negocios, operada por Fernando Julio Güere Calero, persona
      natural (sin RUC registrado a la fecha) ("nosotros", "Kipu"). Puedes contactarnos
      para temas de privacidad escribiendo a
      <a href="mailto:soporte@kipuapp.co.uk">soporte@kipuapp.co.uk</a>.
    </p>

    <h2>2. Una distinción importante: tus datos vs. los datos de tus clientes</h2>
    <p>
      Esta política distingue dos tipos de datos personales que pasan por Kipu, porque la
      responsabilidad legal sobre cada uno es distinta:
    </p>
    <ul>
      <li>
        <strong>Datos de tu cuenta</strong> (tú y tu personal, como dueño o cajero de un
        negocio que usa Kipu): aquí <strong>Kipu es responsable directo</strong> del
        tratamiento — los recopilamos nosotros, para darte el servicio.
      </li>
      <li>
        <strong>Datos de tus propios clientes</strong> (la gente a la que tú le vendes,
        que tú registras en Kipu para llevar su historial de compras o venderles a
        crédito): aquí <strong>tu negocio es el responsable</strong> frente a esas
        personas — tú decides qué datos pedirles y para qué. Kipu solo los aloja y
        procesa por tu instrucción, como <strong>encargado del tratamiento</strong>, sin
        usarlos para ningún fin propio (nunca los vendemos, ni los usamos para
        publicidad, ni te contactamos a ti o a tus clientes con fines distintos a operar
        el servicio).
      </li>
    </ul>

    <h2>3. Qué datos personales recopilamos</h2>
    <p><strong>3.1. De ti y tu personal (cuenta)</strong></p>
    <ul>
      <li>Nombre y apellido.</li>
      <li>Correo electrónico.</li>
      <li>Teléfono (opcional, según el formulario de invitación de personal).</li>
      <li>
        Contraseña — nunca se guarda en texto plano, se almacena con hash criptográfico
        (bcrypt/similar); ni siquiera nuestro propio personal técnico puede verla.
      </li>
      <li>Rol dentro del negocio (Administrador, Cajero, Almacén).</li>
    </ul>

    <p><strong>3.2. De los clientes de tu negocio (datos que tú ingresas)</strong></p>
    <p>
      Estos campos existen porque tu negocio los usa para vender a crédito o llevar
      historial — ninguno es obligatorio salvo el nombre:
    </p>
    <ul>
      <li>Nombre completo (obligatorio).</li>
      <li>Documento de identidad (DNI/RUC) — opcional.</li>
      <li>Teléfono — opcional.</li>
      <li>Correo electrónico — opcional.</li>
      <li>
        Historial de compras y, si aplica, de pagos a cuotas (montos, fechas, cuotas
        pendientes).
      </li>
    </ul>

    <p><strong>3.3. De tus proveedores</strong></p>
    <p>
      Nombre o razón social, RUC, correo, teléfono, dirección y persona de contacto —
      datos que registras tú mismo para gestionar órdenes de compra.
    </p>

    <p><strong>3.4. Datos técnicos</strong></p>
    <ul>
      <li>
        <strong>Cookie de sesión.</strong> Kipu usa una sola cookie, estrictamente
        necesaria: te mantiene conectado después de iniciar sesión, sin ella tendrías que
        volver a iniciar sesión en cada página. Es de tipo <code>httpOnly</code> (ni
        siquiera el propio código de la página puede leerla, lo que reduce el riesgo de
        que un script malicioso la robe) y se borra al cerrar sesión o al expirar
        automáticamente. <strong>Kipu no usa cookies de analítica, publicidad ni rastreo
        de terceros</strong> — no hay Google Analytics, píxeles de Meta/Google Ads, ni
        ningún script equivalente en la aplicación. Por ser estrictamente necesaria para
        que el servicio funcione, esta cookie no requiere un banner de consentimiento
        previo (tanto bajo el marco peruano como bajo estándares internacionales de
        referencia, como el RGPD/ePrivacy europeo, que solo exigen ese banner para
        cookies no esenciales). Si en el futuro agregamos cookies no esenciales,
        actualizaremos esta política y agregaremos un mecanismo para aceptarlas o
        rechazarlas antes de que se activen. Puedes ver, bloquear o borrar cookies desde
        la configuración de privacidad de tu navegador — ten en cuenta que borrar la
        cookie de sesión de Kipu cerrará tu sesión activa.
      </li>
      <li>
        Dirección IP y registros técnicos del servidor (logs), por seguridad y
        diagnóstico de fallas — se conservan por tiempo limitado, no se usan para
        perfilarte.
      </li>
    </ul>
    <p>
      <strong>Lo que Kipu no recopila:</strong> no pedimos datos de tarjetas ni cuentas
      bancarias (no procesamos pagos, ver
      <router-link :to="{ name: 'terms-of-service' }">Términos y Condiciones</router-link>
      §2), no usamos cookies de publicidad ni de analítica de terceros, y no accedemos a
      tu ubicación ni a tus contactos.
    </p>

    <h2>4. Para qué usamos estos datos</h2>
    <ul>
      <li>
        Darte el servicio: crear tu cuenta, autenticarte, guardar tu
        catálogo/ventas/stock, calcular tus reportes y alertas.
      </li>
      <li>
        Enviarte correos operativos (por ejemplo, para restablecer tu contraseña) a
        través de nuestro proveedor de envío de correos, Resend.
      </li>
      <li>Mantener la seguridad de la plataforma (detectar accesos indebidos, prevenir abuso).</li>
      <li>Cumplir obligaciones legales cuando corresponda.</li>
    </ul>
    <p>
      No usamos tus datos ni los de tus clientes para publicidad, no los vendemos, y no
      los compartimos con terceros salvo lo descrito en la sección 5.
    </p>

    <h2>5. Con quién compartimos datos</h2>
    <p>
      Compartimos datos únicamente con los proveedores que necesitamos para operar Kipu,
      todos actuando como encargados de tratamiento bajo nuestras instrucciones:
    </p>
    <ul>
      <li><strong>Railway</strong> (o el proveedor de hosting vigente) — aloja el servidor y la base de datos.</li>
      <li><strong>Cloudflare</strong> (o el proveedor de hosting vigente) — sirve la aplicación web.</li>
      <li><strong>Resend</strong> — envía correos transaccionales (ej. restablecimiento de contraseña).</li>
    </ul>
    <p>
      No compartimos tus datos con terceros para fines de marketing, ni los vendemos bajo
      ninguna circunstancia. Podríamos divulgar información si la ley peruana nos obliga
      a ello (por ejemplo, un requerimiento judicial válido).
    </p>

    <h2>6. Dónde se almacenan los datos</h2>
    <p>
      Tus datos y los de tus clientes se almacenan en servidores de Railway ubicados en
      <strong>Ámsterdam, Países Bajos (región EU West)</strong> — fuera del Perú. Esto
      significa que, al usar Kipu, tus datos viajan y se procesan en la Unión Europea.
    </p>
    <p>
      Los Países Bajos forman parte de la Unión Europea, cuyo marco de protección de
      datos (el RGPD/GDPR) es uno de los más estrictos del mundo y ofrece garantías
      equivalentes o superiores a las exigidas por la legislación peruana. Al usar Kipu,
      aceptas esta transferencia internacional de datos, tal como lo permite la Ley N°
      29733 cuando el país de destino cuenta con un nivel de protección adecuado, como es
      el caso de la Unión Europea.
    </p>
    <p>Si en el futuro cambiamos de proveedor o de región de alojamiento, actualizaremos esta sección.</p>

    <h2>7. Cuánto tiempo conservamos los datos</h2>
    <ul>
      <li>
        Mientras tu cuenta esté activa, conservamos tus datos y los de tus clientes para
        que puedas seguir usando el servicio con tu historial completo.
      </li>
      <li>
        Si cierras tu cuenta, eliminamos tus datos dentro de 14 días (2 semanas), salvo
        lo que debamos conservar por obligación legal (por ejemplo, registros contables
        mínimos).
      </li>
      <li>
        Los registros técnicos (logs) se conservan por un plazo corto y luego se
        descartan automáticamente.
      </li>
    </ul>

    <h2>8. Tus derechos (y los de tus clientes)</h2>
    <p>Bajo la Ley N° 29733, tienes derecho a:</p>
    <ul>
      <li><strong>Acceder</strong> a los datos personales que tenemos sobre ti.</li>
      <li><strong>Rectificar</strong> datos inexactos o incompletos.</li>
      <li><strong>Cancelar</strong> (eliminar) tus datos, sujeto a las excepciones legales aplicables.</li>
      <li><strong>Oponerte</strong> al tratamiento de tus datos en ciertos casos.</li>
    </ul>
    <p>
      Para ejercer estos derechos sobre tu propia cuenta, escríbenos a
      <a href="mailto:soporte@kipuapp.co.uk">soporte@kipuapp.co.uk</a>.
    </p>
    <p>
      Si eres cliente de un negocio que usa Kipu y quieres ejercer estos derechos sobre
      tus propios datos, debes contactar directamente a ese negocio — es quien decide qué
      datos tuyos conserva y por qué (ver sección 2). Si el negocio no puede atenderte,
      podemos ayudarte a facilitar el contacto.
    </p>

    <h2>9. Seguridad</h2>
    <p>
      Protegemos los datos con medidas técnicas razonables: contraseñas siempre
      hasheadas (nunca en texto plano), comunicación cifrada (HTTPS) entre tu navegador y
      nuestros servidores, y aislamiento estricto de datos entre negocios distintos — el
      personal de un negocio nunca puede ver los datos de otro negocio que use Kipu.
      Ningún sistema es 100% infalible, pero trabajamos activamente para mantener estas
      protecciones al día.
    </p>

    <h2>10. Menores de edad</h2>
    <p>
      Kipu está dirigido a negocios y a las personas adultas que los operan. No está
      dirigido a menores de edad y no recopilamos intencionalmente datos de menores.
    </p>

    <h2>11. Cambios a esta política</h2>
    <p>
      Podemos actualizar esta política con el tiempo. Si el cambio es significativo, te
      avisaremos por correo o dentro de la app con anticipación razonable.
    </p>

    <h2>12. Contacto</h2>
    <p>
      Para cualquier consulta sobre esta política o sobre tus datos:
      <a href="mailto:soporte@kipuapp.co.uk">soporte@kipuapp.co.uk</a>.
    </p>
  </LegalLayout>
</template>
