package bo.edu.uagrm.informatica.direccion;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class InfraestructuraTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;

    private HttpResponse<String> get(String path) throws Exception {
        return HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test void saludDisponibleSinDetalles() throws Exception {
        var response = get("/actuator/health");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("UP").doesNotContain("components", "details");
    }

    @Test void accesoNoAutorizadoBloqueado() throws Exception {
        assertThat(get("/api/usuarios").statusCode()).isIn(401, 403);
        assertThat(get("/actuator/env").statusCode()).isIn(401, 403);
    }

    @Test void migracionAplicada() {
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version = '1' and success", Integer.class)).isEqualTo(1);
    }
}
