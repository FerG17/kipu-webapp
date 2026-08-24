<script setup>
import LegalLayout from './legal-layout.vue';
</script>

<template>
  <LegalLayout title="Términos y Condiciones de Uso" updated-at="23/08/2026">
    <h2>1. Aceptación de estos términos</h2>
    <p>
      Kipu es operado por Fernando Julio Güere Calero, persona natural (sin RUC registrado
      a la fecha) ("nosotros", "Kipu"). Puedes contactarnos para temas relacionados a estos
      términos escribiendo a <a href="mailto:fguerec17@gmail.com">fguerec17@gmail.com</a>.
    </p>
    <p>
      Al crear una cuenta o usar Kipu (la aplicación web de gestión de inventario, ventas
      y punto de venta descrita a continuación), aceptas estos Términos y Condiciones. Si
      no estás de acuerdo, no debes usar el servicio.
    </p>
    <p>
      Estos términos rigen el uso de Kipu por parte de negocios ("tú", "el negocio") y de
      las personas que ese negocio autoriza a usar la cuenta (dueño, cajeros, personal de
      almacén).
    </p>

    <h2>2. Qué es Kipu</h2>
    <p>
      Kipu es una herramienta de software como servicio (SaaS) para que bodegas y pequeños
      negocios gestionen:
    </p>
    <ul>
      <li>Su catálogo de productos e inventario, incluyendo múltiples almacenes y lotes.</li>
      <li>Sus ventas, incluyendo ventas al contado y ventas a crédito con planes de cuotas.</li>
      <li>Sus proveedores y órdenes de compra.</li>
      <li>Alertas de stock bajo y de productos próximos a vencer.</li>
      <li>Reportes básicos de su operación (ventas, movimientos de stock, valor de inventario).</li>
    </ul>
    <p>
      <strong>Kipu no procesa pagos.</strong> Cuando registras una venta como "efectivo",
      "tarjeta", "Yape" o "Plin", Kipu solo guarda esa información como parte del historial
      de la venta — el cobro en sí ocurre fuera de la aplicación, por los medios que tu
      negocio ya usa (POS físico, Yape/Plin propios, efectivo). Kipu no es una pasarela de
      pago ni tiene acceso a tarjetas, cuentas bancarias o billeteras digitales de tus
      clientes.
    </p>

    <h2>3. Cuentas y registro</h2>
    <ul>
      <li>
        El acceso a Kipu se otorga por invitación: el dueño de un negocio crea la cuenta
        inicial y desde ahí puede invitar a su personal (cajeros, encargados de almacén)
        con roles y permisos distintos.
      </li>
      <li>
        Eres responsable de mantener la confidencialidad de tu contraseña y de toda
        actividad que ocurra bajo tu cuenta. Avísanos de inmediato si sospechas un acceso
        no autorizado.
      </li>
      <li>
        Debes dar información veraz al registrarte (nombre, correo, datos del negocio).
        Una cuenta pertenece a un solo negocio; los datos de un negocio no son visibles
        para otros negocios que usen Kipu.
      </li>
    </ul>

    <h2>4. Uso aceptable</h2>
    <p>Al usar Kipu, te comprometes a no:</p>
    <ul>
      <li>
        Usar el servicio para fines ilegales, fraudulentos o para almacenar datos de
        clientes obtenidos sin su conocimiento.
      </li>
      <li>Intentar acceder a cuentas, datos o negocios que no son tuyos.</li>
      <li>Realizar ingeniería inversa, copiar o revender el software de Kipu.</li>
      <li>
        Sobrecargar deliberadamente la infraestructura (scraping masivo, bots, ataques de
        denegación de servicio).
      </li>
      <li>Subir contenido malicioso (virus, scripts) a través de los campos del sistema.</li>
    </ul>
    <p>
      Podemos suspender o cerrar una cuenta que incumpla esto, avisando cuando sea
      razonablemente posible hacerlo.
    </p>

    <h2>5. Tus datos y los datos de tus clientes</h2>
    <ul>
      <li>
        <strong>Los datos que ingresas en Kipu son tuyos.</strong> Tu catálogo de
        productos, tu historial de ventas, y los datos de tus clientes y proveedores le
        pertenecen a tu negocio — Kipu solo los aloja y procesa para poder darte el
        servicio.
      </li>
      <li>
        Cuando registras a un cliente tuyo en Kipu (por ejemplo, para una venta a
        crédito), tú eres responsable frente a esa persona de haber obtenido su
        información de forma correcta y de cumplir tus propias obligaciones de privacidad
        con ella. Kipu actúa como encargado del tratamiento de esos datos, no como dueño —
        ver la <router-link :to="{ name: 'privacy-policy' }">Política de Privacidad</router-link>
        para el detalle de esta distinción.
      </li>
      <li>
        Puedes exportar o solicitar la eliminación de tus datos en cualquier momento (ver
        sección 9, "Terminación").
      </li>
    </ul>

    <h2>6. Planes y disponibilidad del servicio</h2>
    <p>
      Kipu tiene un costo por su uso. Este costo se acuerda y se paga <strong>directamente
      entre tú y quien te brinda el servicio</strong> (por ejemplo, mediante depósito o
      transferencia bancaria), <strong>fuera de la aplicación web</strong> — Kipu en sí no
      cobra, no factura ni procesa ningún pago dentro de la plataforma (ver también la
      sección 2, "Kipu no procesa pagos"). El monto, la frecuencia y las condiciones de
      pago se acuerdan por fuera de estos Términos, directamente contigo.
    </p>
    <p>
      Hacemos nuestro mejor esfuerzo para mantener Kipu disponible, pero no garantizamos
      un tiempo de actividad específico (SLA). Puede haber interrupciones por
      mantenimiento, fallas técnicas, o causas fuera de nuestro control. Te avisaremos con
      anticipación razonable ante mantenimientos programados que puedan afectar tu
      operación.
    </p>

    <h2>7. Limitación de responsabilidad</h2>
    <p>Kipu se ofrece "tal cual". En la medida permitida por la ley:</p>
    <ul>
      <li>No garantizamos que el servicio esté libre de errores en todo momento.</li>
      <li>
        No somos responsables por decisiones comerciales que tomes basándote en los
        reportes o datos de la app (por ejemplo, pérdidas por errores de stock que tú
        mismo hayas ingresado).
      </li>
      <li>
        No somos responsables por el incumplimiento de tus propias obligaciones frente a
        tus clientes o proveedores (cobros, entregas, garantías) — eso queda entre tú y
        ellos.
      </li>
      <li>
        Nuestra responsabilidad total frente a ti, si llegara a existir, se limita a lo
        que hayas pagado por el servicio en los últimos 12 meses.
      </li>
    </ul>

    <h2>8. Terminación</h2>
    <p>
      Puedes dejar de usar Kipu y solicitar el cierre de tu cuenta cuando quieras,
      escribiendo a <a href="mailto:fguerec17@gmail.com">fguerec17@gmail.com</a>. Al
      cerrar una cuenta, tus datos se eliminan según lo descrito en la Política de
      Privacidad, salvo lo que debamos conservar por obligación legal.
    </p>
    <p>
      Podemos suspender o cerrar cuentas que incumplan gravemente estos términos,
      avisando cuando sea razonable hacerlo.
    </p>

    <h2>9. Cambios a estos términos</h2>
    <p>
      Podemos actualizar estos términos con el tiempo. Si el cambio es significativo, te
      avisaremos por correo o dentro de la app con anticipación razonable antes de que
      entre en vigencia.
    </p>

    <h2>10. Ley aplicable</h2>
    <p>
      Estos términos se rigen por las leyes de la República del Perú. Cualquier disputa
      se resolverá ante los tribunales competentes de Lima, Perú, salvo que la ley
      disponga otra cosa.
    </p>

    <h2>11. Contacto</h2>
    <p>
      Para preguntas sobre estos términos:
      <a href="mailto:fguerec17@gmail.com">fguerec17@gmail.com</a>.
    </p>
  </LegalLayout>
</template>
